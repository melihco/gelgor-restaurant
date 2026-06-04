# Build stage
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build

WORKDIR /src

COPY apps/api/Nexus.sln apps/api/
COPY apps/api/src/Nexus.Api/Nexus.Api.csproj apps/api/src/Nexus.Api/
COPY apps/api/src/Nexus.Application/Nexus.Application.csproj apps/api/src/Nexus.Application/
COPY apps/api/src/Nexus.Contracts/Nexus.Contracts.csproj apps/api/src/Nexus.Contracts/
COPY apps/api/src/Nexus.Domain/Nexus.Domain.csproj apps/api/src/Nexus.Domain/
COPY apps/api/src/Nexus.Infrastructure/Nexus.Infrastructure.csproj apps/api/src/Nexus.Infrastructure/

RUN dotnet restore apps/api/Nexus.sln

COPY apps/api/ apps/api/

RUN dotnet publish apps/api/src/Nexus.Api/Nexus.Api.csproj -c Release -o /app/publish

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:8.0

WORKDIR /app

COPY --from=build /app/publish .

# Railway injects PORT at runtime; ASP.NET Core 8 binds to PORT when ASPNETCORE_URLS is unset.
ENV ASPNETCORE_ENVIRONMENT=Production

ENTRYPOINT ["dotnet", "Nexus.Api.dll"]
