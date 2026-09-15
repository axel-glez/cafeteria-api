import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",

  datasource: {
    // Usa el pooler de sesión de Supabase (5432) para los comandos de Prisma.
    url: env("DIRECT_URL"),
  },
});
