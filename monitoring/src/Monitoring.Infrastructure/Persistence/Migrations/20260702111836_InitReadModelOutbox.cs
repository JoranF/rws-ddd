using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Monitoring.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitReadModelOutbox : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "bekend_kunstwerk",
                columns: table => new
                {
                    KunstwerkId = table.Column<string>(type: "text", nullable: false),
                    Type = table.Column<string>(type: "text", nullable: true),
                    Locatie = table.Column<string>(type: "text", nullable: true),
                    InGebruik = table.Column<bool>(type: "boolean", nullable: false),
                    BijgewerktOp = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_bekend_kunstwerk", x => x.KunstwerkId);
                });

            migrationBuilder.CreateTable(
                name: "outbox_message",
                columns: table => new
                {
                    Id = table.Column<string>(type: "text", nullable: false),
                    EventType = table.Column<string>(type: "text", nullable: false),
                    RoutingKey = table.Column<string>(type: "text", nullable: false),
                    Payload = table.Column<string>(type: "jsonb", nullable: false),
                    Gepubliceerd = table.Column<bool>(type: "boolean", nullable: false),
                    AangemaaktOp = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    GepubliceerdOp = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_outbox_message", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "verwerkt_event",
                columns: table => new
                {
                    EventId = table.Column<string>(type: "text", nullable: false),
                    VerwerktOp = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_verwerkt_event", x => x.EventId);
                });

            migrationBuilder.CreateIndex(
                name: "IX_outbox_message_Gepubliceerd_AangemaaktOp",
                table: "outbox_message",
                columns: new[] { "Gepubliceerd", "AangemaaktOp" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "bekend_kunstwerk");

            migrationBuilder.DropTable(
                name: "outbox_message");

            migrationBuilder.DropTable(
                name: "verwerkt_event");
        }
    }
}
