using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Monitoring.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class DomeinTabellen : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "incident",
                columns: table => new
                {
                    Id = table.Column<string>(type: "text", nullable: false),
                    KunstwerkId = table.Column<string>(type: "text", nullable: false),
                    SensorType = table.Column<string>(type: "text", nullable: false),
                    GemetenWaarde = table.Column<double>(type: "double precision", nullable: false),
                    Drempelwaarde = table.Column<double>(type: "double precision", nullable: false),
                    Ernst = table.Column<string>(type: "text", nullable: false),
                    Omschrijving = table.Column<string>(type: "text", nullable: false),
                    Vervolgactie = table.Column<string>(type: "text", nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false),
                    AangemaaktOp = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    OpgelostOp = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_incident", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "meting",
                columns: table => new
                {
                    Id = table.Column<string>(type: "text", nullable: false),
                    SessieId = table.Column<string>(type: "text", nullable: false),
                    KunstwerkId = table.Column<string>(type: "text", nullable: false),
                    SensorType = table.Column<string>(type: "text", nullable: false),
                    Waarde = table.Column<double>(type: "double precision", nullable: false),
                    Eenheid = table.Column<string>(type: "text", nullable: false),
                    Tijdstip = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_meting", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "monitoring_rapport",
                columns: table => new
                {
                    Id = table.Column<string>(type: "text", nullable: false),
                    KunstwerkId = table.Column<string>(type: "text", nullable: false),
                    PeriodeStart = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    PeriodeEind = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ZwaarsteOpenIncidentId = table.Column<string>(type: "text", nullable: true),
                    Resultaten = table.Column<string>(type: "jsonb", nullable: false),
                    OpgesteldOp = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_monitoring_rapport", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "monitoring_sessie",
                columns: table => new
                {
                    Id = table.Column<string>(type: "text", nullable: false),
                    KunstwerkId = table.Column<string>(type: "text", nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false),
                    GestartOp = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    BeeindigdOp = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    AantalMetingen = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_monitoring_sessie", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_incident_KunstwerkId_Status",
                table: "incident",
                columns: new[] { "KunstwerkId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_meting_KunstwerkId_Tijdstip",
                table: "meting",
                columns: new[] { "KunstwerkId", "Tijdstip" });

            migrationBuilder.CreateIndex(
                name: "IX_monitoring_sessie_KunstwerkId",
                table: "monitoring_sessie",
                column: "KunstwerkId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "incident");

            migrationBuilder.DropTable(
                name: "meting");

            migrationBuilder.DropTable(
                name: "monitoring_rapport");

            migrationBuilder.DropTable(
                name: "monitoring_sessie");
        }
    }
}
