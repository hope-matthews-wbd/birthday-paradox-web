import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const environment = {
  SITE_BASIC_AUTH_USERNAME: "test-user",
  SITE_BASIC_AUTH_PASSWORD: "test-password",
};

globalThis.Netlify = {
  env: {
    get(name) {
      return environment[name];
    },
  },
};

const functionSource = await readFile(
  new URL("../netlify/edge-functions/basic-auth.js", import.meta.url),
  "utf8",
);
const functionModuleUrl = `data:text/javascript;base64,${Buffer.from(functionSource).toString("base64")}`;
const { default: basicAuth } = await import(functionModuleUrl);
const context = {
  next() {
    return new Response("Authorized", { status: 200 });
  },
};

function request(credentials) {
  const headers = new Headers();
  if (credentials) headers.set("authorization", `Basic ${btoa(credentials)}`);
  return new Request("https://example.netlify.app/", { headers });
}

let response = await basicAuth(request(), context);
assert.equal(response.status, 401);
assert.match(response.headers.get("www-authenticate"), /^Basic /);

response = await basicAuth(request("test-user:wrong-password"), context);
assert.equal(response.status, 401);

response = await basicAuth(request("wrong-user:test-password"), context);
assert.equal(response.status, 401);

response = await basicAuth(request("test-user:test-password"), context);
assert.equal(response.status, 200);
assert.equal(await response.text(), "Authorized");

delete environment.SITE_BASIC_AUTH_PASSWORD;
response = await basicAuth(request("test-user:test-password"), context);
assert.equal(response.status, 503);

console.log("Basic authentication tests passed.");
