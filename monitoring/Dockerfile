# Monitoring-service — .NET 10 multi-stage
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY src/ ./src/
RUN dotnet publish src/Monitoring.Api/Monitoring.Api.csproj -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app ./
EXPOSE 8002
ENTRYPOINT ["dotnet", "Monitoring.Api.dll"]
