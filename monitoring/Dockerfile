# Dockerfile — stack-agnostisch template (Rijkswaterstaat DDD)
#
# Deze service kiest zelf zijn taal/framework. Eisen (zie ../docs/conventions.md):
#   - Luister op poort 8002 (SERVICE_PORT in .env)
#   - Expose GET /health -> 200
#   - Lees RABBITMQ_URL en DATABASE_URL uit de omgeving
#
# Kies EEN variant hieronder, verwijder de rest en dit commentaarblok,
# en activeer daarna je service-blok in ../docker-compose.yml.

# --- Node.js (TypeScript) ---
# FROM node:22-alpine
# WORKDIR /app
# COPY package*.json ./
# RUN npm ci
# COPY . .
# RUN npm run build
# EXPOSE 8002
# CMD ["node", "dist/main.js"]

# --- Java (Spring Boot, multi-stage) ---
# FROM maven:3.9-eclipse-temurin-21 AS build
# WORKDIR /app
# COPY . .
# RUN mvn -q clean package -DskipTests
# FROM eclipse-temurin:21-jre
# COPY --from=build /app/target/*.jar /app/app.jar
# EXPOSE 8002
# ENTRYPOINT ["java","-jar","/app/app.jar"]

# --- .NET (ASP.NET Core) ---
# FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
# WORKDIR /src
# COPY . .
# RUN dotnet publish -c Release -o /app
# FROM mcr.microsoft.com/dotnet/aspnet:8.0
# WORKDIR /app
# COPY --from=build /app .
# EXPOSE 8002
# ENTRYPOINT ["dotnet","Service.dll"]

# --- Python (FastAPI) ---
# FROM python:3.12-slim
# WORKDIR /app
# COPY requirements.txt .
# RUN pip install --no-cache-dir -r requirements.txt
# COPY . .
# EXPOSE 8002
# CMD ["uvicorn","main:app","--host","0.0.0.0","--port","8002"]
