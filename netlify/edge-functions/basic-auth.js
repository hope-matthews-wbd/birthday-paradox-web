const USERNAME_ENV = "SITE_BASIC_AUTH_USERNAME";
const PASSWORD_ENV = "SITE_BASIC_AUTH_PASSWORD";

function textResponse(body, status, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "text/plain; charset=utf-8",
      ...headers,
    },
  });
}

function unauthorized() {
  return textResponse("Authentication required.", 401, {
    "www-authenticate": 'Basic realm="Alpha Testing", charset="UTF-8"',
  });
}

function constantTimeEqual(left, right) {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let mismatch = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < length; index += 1) {
    mismatch |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
  }

  return mismatch === 0;
}

function readBasicCredentials(request) {
  const authorization = request.headers.get("authorization");
  if (!authorization || !authorization.startsWith("Basic ")) return null;

  try {
    const decoded = atob(authorization.slice(6).trim());
    const separator = decoded.indexOf(":");
    if (separator < 0) return null;
    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

export default async function basicAuth(request, context) {
  const expectedUsername = Netlify.env.get(USERNAME_ENV);
  const expectedPassword = Netlify.env.get(PASSWORD_ENV);

  if (!expectedUsername || !expectedPassword) {
    return textResponse("Site authentication is not configured.", 503);
  }

  const credentials = readBasicCredentials(request);
  if (
    !credentials ||
    !constantTimeEqual(credentials.username, expectedUsername) ||
    !constantTimeEqual(credentials.password, expectedPassword)
  ) {
    return unauthorized();
  }

  return context.next();
}

export const config = { path: "/*" };
