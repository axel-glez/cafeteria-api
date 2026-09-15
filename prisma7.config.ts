import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",

  datasource: {
    // Prefiere la conexión directa para los comandos de base de datos.
    // Generar el cliente no necesita conectarse ni exigir DIRECT_URL.
    url: process.env.DIRECT_URL || process.env.DATABASE_URL,
  },
});
