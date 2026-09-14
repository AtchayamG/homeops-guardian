import { createMcpApp } from './server.js';

const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '127.0.0.1';

const { app } = createMcpApp();

const server = app.listen(PORT, HOST, () => {
  console.log(`[HomeOps MCP Server] Running at http://${HOST}:${PORT}/mcp`);
  console.log(`[HomeOps MCP Server] Health probe at http://${HOST}:${PORT}/health`);
  console.log(`[HomeOps MCP Server] Protocol version: 2025-11-25`);
});

const gracefulShutdown = () => {
  console.log('[HomeOps MCP Server] Shutting down gracefully...');
  server.close(() => {
    console.log('[HomeOps MCP Server] Server closed.');
    process.exit(0);
  });
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
