class ApplicationError(Exception):
    """Base class for application-level failures."""


class NotFoundError(ApplicationError):
    pass


class ConflictError(ApplicationError):
    pass
