-- Database-per-context (DDD): elke bounded context krijgt een eigen database.
-- Draait automatisch bij de eerste start van de postgres-container.
CREATE DATABASE beheer_db;
CREATE DATABASE contract_db;
CREATE DATABASE monitoring_db;
CREATE DATABASE onderhoud_db;
