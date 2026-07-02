from __future__ import annotations

import threading
from collections.abc import Callable

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

from infrastructure.config import AuthSettings

# HTTP-methoden die als schrijfactie tellen: hiervoor is de eigen context-rol vereist.
# Leesacties (GET, HEAD, OPTIONS) mogen door elke ingelogde gebruiker.
_WRITE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})


class _JwksCache:
    """Cachet de JWKS-signing-keys zodat niet elk request de JWKS-uri raakt.

    ``PyJWKClient`` cachet zelf al keys, maar we omhullen het zodat de client
    één keer wordt opgebouwd (met een lock) en later herbruikt wordt.
    """

    def __init__(self, jwks_uri: str, lifespan_seconds: int = 3600) -> None:
        self._jwks_uri = jwks_uri
        self._lifespan_seconds = lifespan_seconds
        self._lock = threading.Lock()
        self._client: PyJWKClient | None = None

    def signing_key(self, token: str) -> str:
        client = self._get_client()
        return client.get_signing_key_from_jwt(token).key

    def _get_client(self) -> PyJWKClient:
        if self._client is None:
            with self._lock:
                if self._client is None:
                    self._client = PyJWKClient(
                        self._jwks_uri,
                        cache_keys=True,
                        lifespan=self._lifespan_seconds,
                    )
        return self._client


def _extract_roles(claims: dict[str, object]) -> list[str]:
    realm_access = claims.get("realm_access")
    if not isinstance(realm_access, dict):
        return []
    roles = realm_access.get("roles")
    if not isinstance(roles, list):
        return []
    return [role for role in roles if isinstance(role, str)]


def build_auth_dependency(settings: AuthSettings) -> Callable[..., None]:
    """Bouwt een FastAPI-dependency die het bearer-token valideert.

    - Uitgeschakeld (``AUTH_ENABLED=false``): dependency is een no-op, zodat het
      bestaande gedrag en de bestaande tests ongewijzigd blijven.
    - Ingeschakeld: verifieert handtekening via JWKS, controleert issuer en
      expiratie (geen audience-check), en dwingt de eigen context-rol af op
      schrijfacties (POST/PUT/PATCH/DELETE). Leesacties (GET) vereisen alleen
      een geldig token.
    """

    if not settings.auth_enabled:

        def _auth_disabled() -> None:
            return None

        return _auth_disabled

    jwks_cache = _JwksCache(settings.oidc_jwks_uri)
    # auto_error=False: we geven zelf een 401 zodat de foutmelding consistent is.
    bearer_scheme = HTTPBearer(auto_error=False)

    def _require_auth(
        request: Request,
        credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    ) -> None:
        if credentials is None or not credentials.credentials:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Bearer-token ontbreekt",
                headers={"WWW-Authenticate": "Bearer"},
            )

        token = credentials.credentials
        try:
            signing_key = jwks_cache.signing_key(token)
            claims = jwt.decode(
                token,
                signing_key,
                algorithms=["RS256"],
                issuer=settings.oidc_issuer,
                options={"verify_aud": False, "require": ["exp", "iss"]},
            )
        except jwt.PyJWTError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Ongeldig token: {exc}",
                headers={"WWW-Authenticate": "Bearer"},
            ) from exc

        if request.method.upper() in _WRITE_METHODS:
            if settings.oidc_required_role not in _extract_roles(claims):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=(
                        f"Rol '{settings.oidc_required_role}' vereist voor schrijfacties"
                    ),
                )

        return None

    return _require_auth
