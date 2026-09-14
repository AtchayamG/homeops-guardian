# MCP Streamable HTTP & Agent Skills Specification Notes

> Grounded specification requirements for Project 3 (Alexa+ Track).
> Researched and compiled on 2026-09-03.
> Every requirement is cited from official documentation. No unconfirmed specs are inferred.

---

## 1. Streamable HTTP Transport Specification
- **Specification URL**: `https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#streamable-http`
- **Protocol Version**: `2025-11-25` (supersedes `2024-11-05` HTTP+SSE transport)

### 1.1 Endpoint Architecture & Binding
- **Single Endpoint Path**: The server MUST provide a single HTTP endpoint path (hereafter referred to as the MCP endpoint) that supports both POST and GET methods (e.g., `http://127.0.0.1:3001/mcp`).
  - *Citation*: `https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#streamable-http`, Section "Streamable HTTP", Paragraph 3.
- **Localhost Binding**: When running locally, servers SHOULD bind only to localhost (`127.0.0.1`) rather than all network interfaces (`0.0.0.0`).
  - *Citation*: `https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#streamable-http`, Section "Security Warning", Item 2.
- **Origin Validation**: Servers MUST validate the `Origin` header on all incoming connections to prevent DNS rebinding attacks. If the `Origin` header is present and invalid, servers MUST respond with HTTP 403 Forbidden. The HTTP response body MAY comprise a JSON-RPC error response that has no `id`.
  - *Citation*: `https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#streamable-http`, Section "Security Warning", Item 1.

### 1.2 Client POST Request Semantics
- **New HTTP Request per Message**: Every JSON-RPC message sent from the client MUST be a new HTTP POST request to the MCP endpoint.
  - *Citation*: `https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#streamable-http`, Section "Sending Messages to the Server", Leading statement.
- **HTTP Method**: The client MUST use HTTP POST to send JSON-RPC messages to the MCP endpoint.
  - *Citation*: `https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#streamable-http`, Section "Sending Messages to the Server", Item 1.
- **Accept Header**: The client MUST include an `Accept` header, listing both `application/json` and `text/event-stream` as supported content types.
  - *Citation*: `https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#streamable-http`, Section "Sending Messages to the Server", Item 2.
- **Payload Format**: The body of the POST request MUST be a single JSON-RPC *request*, *notification*, or *response*.
  - *Citation*: `https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#streamable-http`, Section "Sending Messages to the Server", Item 3.

### 1.3 Server Response Semantics for POST
- **Notification / Response Acknowledgement**: If the input is a JSON-RPC response or notification:
  - If the server accepts the input, the server MUST return HTTP status code `202 Accepted` with no body.
  - If the server cannot accept the input, it MUST return an HTTP error status code (e.g., `400 Bad Request`). The HTTP response body MAY comprise a JSON-RPC error response that has no `id`.
  - *Citation*: `https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#streamable-http`, Section "Sending Messages to the Server", Item 4.
- **Request Response Types**: If the input is a JSON-RPC request, the server MUST either return `Content-Type: text/event-stream`, to initiate an SSE stream, or `Content-Type: application/json`, to return one JSON object. The client MUST support both these cases.
  - *Citation*: `https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#streamable-http`, Section "Sending Messages to the Server", Item 5.
- **SSE Priming Event**: If the server initiates an SSE stream, the server SHOULD immediately send an SSE event consisting of an event ID and an empty `data` field in order to prime the client to reconnect (using that event ID as `Last-Event-ID`).
  - *Citation*: `https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#streamable-http`, Section "Sending Messages to the Server", Item 6.

### 1.4 Client GET Request Semantics (SSE Listening)
- **Optional GET Stream**: The client MAY issue an HTTP GET to the MCP endpoint. This can be used to open an SSE stream, allowing the server to communicate to the client without the client first sending data via HTTP POST.
  - *Citation*: `https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#streamable-http`, Section "Listening for Messages from the Server", Item 1.
- **Accept Header for GET**: The client MUST include an `Accept` header, listing `text/event-stream` as a supported content type.
  - *Citation*: `https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#streamable-http`, Section "Listening for Messages from the Server", Item 2.
- **Server Response to GET**: The server MUST either return `Content-Type: text/event-stream` in response to this HTTP GET, or else return HTTP `405 Method Not Allowed`, indicating that the server does not offer an SSE stream at this endpoint.
  - *Citation*: `https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#streamable-http`, Section "Listening for Messages from the Server", Item 3.
- **Disallowed Responses on GET Stream**: The server MUST NOT send a JSON-RPC response on the stream unless resuming a stream associated with a previous client request.
  - *Citation*: `https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#streamable-http`, Section "Listening for Messages from the Server", Item 4.

### 1.5 Session Management (`MCP-Session-Id`)
- **Session ID Assignment**: A server using the Streamable HTTP transport MAY assign a session ID at initialization time, by including it in an `MCP-Session-Id` header on the HTTP response containing the `InitializeResult`.
  - *Citation*: `https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#streamable-http`, Section "Session Management", Item 1.
- **Session ID Format**: The session ID SHOULD be globally unique and cryptographically secure (e.g., a securely generated UUID). The session ID MUST only contain visible ASCII characters (ranging from `0x21` to `0x7E`).
  - *Citation*: `https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#streamable-http`, Section "Session Management", Item 1.
- **Subsequent Requests Header**: If an `MCP-Session-Id` is returned by the server during initialization, clients using the Streamable HTTP transport MUST include it in the `MCP-Session-Id` header on all of their subsequent HTTP requests.
  - *Citation*: `https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#streamable-http`, Section "Session Management", Item 2.
- **Missing Session ID Error**: Servers that require a session ID SHOULD respond to requests without an `MCP-Session-Id` header (other than initialization) with HTTP `400 Bad Request`.
  - *Citation*: `https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#streamable-http`, Section "Session Management", Item 2.
- **Session Expiration / Termination**: The server MAY terminate the session at any time, after which it MUST respond to requests containing that session ID with HTTP `404 Not Found`. When a client receives HTTP `404` in response to a request containing an `MCP-Session-Id`, it MUST start a new session by sending a new `InitializeRequest` without a session ID attached.
  - *Citation*: `https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#streamable-http`, Section "Session Management", Items 3 and 4.
- **Explicit Client Session Termination**: Clients that no longer need a particular session SHOULD send an HTTP `DELETE` to the MCP endpoint with the `MCP-Session-Id` header to explicitly terminate the session. The server MAY respond with HTTP `405 Method Not Allowed` if it does not allow clients to terminate sessions.
  - *Citation*: `https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#streamable-http`, Section "Session Management", Item 5.

### 1.6 Protocol Version Header (`MCP-Protocol-Version`)
- **Header Requirement**: If using HTTP, the client MUST include the `MCP-Protocol-Version: <protocol-version>` HTTP header on all subsequent requests to the MCP server, allowing the MCP server to respond based on the MCP protocol version (e.g. `MCP-Protocol-Version: 2025-11-25`).
  - *Citation*: `https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#streamable-http`, Section "Protocol Version Header", Paragraph 1.
- **Fallback Version**: For backwards compatibility, if the server does not receive an `MCP-Protocol-Version` header, and has no other way to identify the version, the server SHOULD assume protocol version `2025-03-26`.
  - *Citation*: `https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#streamable-http`, Section "Protocol Version Header", Paragraph 4.
- **Unsupported Version**: If the server receives a request with an invalid or unsupported `MCP-Protocol-Version`, it MUST respond with `400 Bad Request`.
  - *Citation*: `https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#streamable-http`, Section "Protocol Version Header", Paragraph 5.

### 1.7 Resumability and Redelivery
- **Event ID**: Servers MAY attach an `id` field to their SSE events. If present, the ID MUST be globally unique across all streams within that session.
  - *Citation*: `https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#streamable-http`, Section "Resumability and Redelivery", Item 1.
- **Resumption via Last-Event-ID**: If the client wishes to resume after a disconnection, it SHOULD issue an HTTP GET to the MCP endpoint, and include the `Last-Event-ID` header. The server MAY use this header to replay messages sent after that event ID on that stream.
  - *Citation*: `https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#streamable-http`, Section "Resumability and Redelivery", Item 2.

---

## 2. MCP Apps & Agent Skills Specification
- **Specification URL**: `https://apps.extensions.modelcontextprotocol.io/api/#build-with-agent-skills`
- **Specification File**: `https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx`

### 2.1 Core Agent Skills Capabilities
- **Available Skills in `@modelcontextprotocol/ext-apps`**:
  1. `create-mcp-app`: Scaffolds a new MCP App with an interactive UI from scratch.
  2. `migrate-oai-app`: Converts an existing OpenAI App to use MCP Apps.
  3. `add-app-to-server`: Adds interactive UI to an existing MCP server's tools.
  4. `convert-web-app`: Turns an existing web app into a hybrid web + MCP App.
  - *Citation*: `https://apps.extensions.modelcontextprotocol.io/api/#build-with-agent-skills`, Table of Skills.

### 2.2 Interactive UI Extension Concept
- MCP Apps extends the base MCP specification by allowing tools to return interactive UI components (such as dashboards, charts, and control forms) that render inline in supported conversational clients (ChatGPT, Claude, VS Code, Goose, Postman, MCPJam).
  - *Citation*: `https://apps.extensions.modelcontextprotocol.io/api/`, Leading overview.

---

## 3. Alexa+ Track Status & Constraints
- **Alexa+ MCP Toolkit URL**: `https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-overview.html` (referenced in Devpost hackathon resources).
- **Geographic Restriction**: **BLOCKED for live deployment from India**. The official Alexa+ developer documentation specifies: *"The MCP Toolkit is available in the United States."*
- **Official Rules Fallback**: The hackathon rules explicitly allow a *simulated Alexa+ experience in a web application* when physical device or geographic access is constrained.
- **Technical Consequence**: Our Project 3 architecture implements a fully compliant, production-grade MCP Streamable HTTP server on localhost/cloud, accompanied by a simulated Alexa+ tool client / web inspector, ensuring zero simulated protocol layers while acknowledging the geographic live-deployment limit honestly.
