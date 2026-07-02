from __future__ import annotations

import os
from dataclasses import dataclass


_TRUTHY = {"1", "true", "yes", "ja"}

_DEFAULT_OIDC_ISSUER = "https://keycloak.joranit.com/realms/rws"
_DEFAULT_OIDC_JWKS_URI = (
    "https://keycloak.joranit.com/realms/rws/protocol/openid-connect/certs"
)
# Eigen bounded context van deze service: bepaalt welke rol schrijfacties mag doen.
_DEFAULT_OIDC_REQUIRED_ROLE = "beheer"


@dataclass(frozen=True, slots=True)
class AuthSettings:
    auth_enabled: bool
    oidc_issuer: str
    oidc_jwks_uri: str
    oidc_required_role: str


@dataclass(frozen=True, slots=True)
class Settings:
    service_port: int
    database_url: str
    rabbitmq_url: str
    auth: AuthSettings
    rabbitmq_exchange: str = "rws.events"
    enable_consumers: bool = True


def get_settings() -> Settings:
    return Settings(
        service_port=int(os.getenv("SERVICE_PORT", "8004")),
        database_url=os.getenv(
            "DATABASE_URL",
            "postgresql+psycopg://rws:rws@localhost:5432/beheer_db",
        ),
        rabbitmq_url=os.getenv("RABBITMQ_URL", "amqp://rws:rws@localhost:5672"),
        enable_consumers=os.getenv("ENABLE_RABBITMQ_CONSUMERS", "true").lower()
        in _TRUTHY,
        auth=get_auth_settings(),
    )


def get_auth_settings() -> AuthSettings:
    return AuthSettings(
        auth_enabled=os.getenv("AUTH_ENABLED", "false").lower() in _TRUTHY,
        oidc_issuer=os.getenv("OIDC_ISSUER", _DEFAULT_OIDC_ISSUER),
        oidc_jwks_uri=os.getenv("OIDC_JWKS_URI", _DEFAULT_OIDC_JWKS_URI),
        oidc_required_role=os.getenv("OIDC_REQUIRED_ROLE", _DEFAULT_OIDC_REQUIRED_ROLE),
    )


def sqlalchemy_url(url: str) -> str:
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url.removeprefix("postgres://")
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url.removeprefix("postgresql://")
    return url
