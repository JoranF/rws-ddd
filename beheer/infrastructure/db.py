from __future__ import annotations

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from infrastructure.config import get_settings, sqlalchemy_url


class Base(DeclarativeBase):
    pass


settings = get_settings()
engine = create_engine(sqlalchemy_url(settings.database_url), pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def check_database() -> bool:
    with engine.connect() as connection:
        connection.execute(text("select 1"))
    return True
