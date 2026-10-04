process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/pedidos_test";
process.env.ENCRYPTION_KEY = "11".repeat(32);
process.env.SESSION_SECRET = "test-secret-test-secret-test-secret-123";
process.env.APP_URL = "https://pedidos.test";
