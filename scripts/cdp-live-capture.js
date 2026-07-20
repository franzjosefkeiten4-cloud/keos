const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

(async () => {
  const endpoint = process.argv[2] || "http://127.0.0.1:9222";
  const urlNeedle = process.argv[3] || "keiten-betriebssystem.web.app";

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logDir = path.resolve("scripts", "logs");
  const logPath = path.join(logDir, `cdp-live-${stamp}.log`);

  fs.mkdirSync(logDir, { recursive: true });

  function serialize(value) {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  function write(kind, payload) {
    const line = `${new Date().toISOString()} ${kind} ${serialize(payload)}`;
    console.log(line);
    fs.appendFileSync(logPath, `${line}\n`, "utf8");
  }

  let browser;

  try {
    browser = await chromium.connectOverCDP(endpoint);

    const contexts = browser.contexts();
    if (!contexts.length) {
      throw new Error("Kein BrowserContext im verbundenen Chrome gefunden.");
    }

    const pages = contexts.flatMap((context) => context.pages());

    write("[OPEN_PAGES]", pages.map((page, index) => ({
      index,
      url: page.url()
    })));

    const page = pages.find((candidate) =>
      candidate.url().includes(urlNeedle)
    );

    if (!page) {
      throw new Error(
        `Kein geöffneter Tab mit URL-Fragment "${urlNeedle}" gefunden.`
      );
    }

    const context = page.context();
    const cdp = await context.newCDPSession(page);

    await cdp.send("Runtime.enable");
    await cdp.send("Debugger.enable");
    await cdp.send("Network.enable");
    await cdp.send("Log.enable");

    write("[CONNECTED]", {
      endpoint,
      pageUrl: page.url(),
      logPath
    });

    const scriptRequests = new Map();

    cdp.on("Runtime.exceptionThrown", (event) => {
      const details = event.exceptionDetails || {};

      write("[Runtime.exceptionThrown]", {
        text: details.text,
        url: details.url,
        lineNumberZeroBased: details.lineNumber,
        columnNumberZeroBased: details.columnNumber,
        lineNumberHuman: Number.isInteger(details.lineNumber)
          ? details.lineNumber + 1
          : null,
        columnNumberHuman: Number.isInteger(details.columnNumber)
          ? details.columnNumber + 1
          : null,
        scriptId: details.scriptId,
        exception: details.exception
          ? {
              className: details.exception.className,
              description: details.exception.description,
              value: details.exception.value
            }
          : null,
        stackTrace: details.stackTrace || null
      });
    });

    cdp.on("Debugger.scriptParsed", (event) => {
      if (
        event.url &&
        (
          event.url.includes("keiten-betriebssystem") ||
          /\.m?js(\?|$)/i.test(event.url)
        )
      ) {
        write("[Debugger.scriptParsed]", {
          scriptId: event.scriptId,
          url: event.url,
          startLineZeroBased: event.startLine,
          startColumnZeroBased: event.startColumn,
          endLineZeroBased: event.endLine,
          endColumnZeroBased: event.endColumn,
          hash: event.hash,
          sourceMapURL: event.sourceMapURL,
          hasSourceURL: event.hasSourceURL,
          isModule: event.isModule,
          length: event.length
        });
      }
    });

    cdp.on("Debugger.scriptFailedToParse", (event) => {
      write("[Debugger.scriptFailedToParse]", {
        scriptId: event.scriptId,
        url: event.url,
        startLineZeroBased: event.startLine,
        startColumnZeroBased: event.startColumn,
        endLineZeroBased: event.endLine,
        endColumnZeroBased: event.endColumn,
        errorMessage: event.errorMessage,
        sourceMapURL: event.sourceMapURL,
        hasSourceURL: event.hasSourceURL,
        isModule: event.isModule,
        length: event.length
      });
    });

    cdp.on("Network.requestWillBeSent", (event) => {
      const url = event.request?.url || "";

      if (event.type === "Script" || /\.m?js(\?|$)/i.test(url)) {
        scriptRequests.set(event.requestId, {
          requestId: event.requestId,
          url,
          type: event.type,
          initiator: event.initiator || null
        });

        write("[Network.requestWillBeSent]", {
          requestId: event.requestId,
          url,
          method: event.request?.method,
          type: event.type,
          initiator: event.initiator || null
        });
      }
    });

    cdp.on("Network.responseReceived", (event) => {
      const response = event.response || {};
      const url = response.url || "";

      if (event.type === "Script" || /\.m?js(\?|$)/i.test(url)) {
        write("[Network.responseReceived]", {
          requestId: event.requestId,
          url,
          status: response.status,
          statusText: response.statusText,
          mimeType: response.mimeType,
          protocol: response.protocol,
          fromDiskCache: response.fromDiskCache,
          fromServiceWorker: response.fromServiceWorker,
          fromPrefetchCache: response.fromPrefetchCache,
          remoteIPAddress: response.remoteIPAddress,
          headers: response.headers || {}
        });
      }
    });

    cdp.on("Network.loadingFinished", async (event) => {
      const request = scriptRequests.get(event.requestId);
      if (!request || !/\/app\.js(\?|$)/i.test(request.url)) {
        return;
      }

      try {
        const bodyResult = await cdp.send("Network.getResponseBody", {
          requestId: event.requestId
        });

        const body = bodyResult.base64Encoded
          ? Buffer.from(bodyResult.body, "base64").toString("utf8")
          : bodyResult.body;

        const lines = body.split(/\r?\n/);
        const targetLine = lines[1430] || "";
        const targetCharacter = targetLine[30] || "";

        write("[APP_JS_BODY]", {
          requestId: event.requestId,
          url: request.url,
          encodedDataLength: event.encodedDataLength,
          bodyLength: body.length,
          lineCount: lines.length,
          line1431: targetLine,
          line1431Character31: targetCharacter,
          line1431Character31CodePoint: targetCharacter
            ? `U+${targetCharacter
                .codePointAt(0)
                .toString(16)
                .toUpperCase()
                .padStart(4, "0")}`
            : null,
          first120: body.slice(0, 120),
          last120: body.slice(-120)
        });
      } catch (error) {
        write("[APP_JS_BODY_ERROR]", {
          requestId: event.requestId,
          url: request.url,
          message: error.message,
          stack: error.stack
        });
      }
    });

    cdp.on("Log.entryAdded", (event) => {
      write("[CDP.Log]", event.entry || event);
    });

    page.on("console", (message) => {
      write("[Console]", {
        type: message.type(),
        text: message.text(),
        location: message.location()
      });
    });

    page.on("pageerror", (error) => {
      write("[PageError]", {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
    });

    page.on("requestfailed", (request) => {
      write("[RequestFailed]", {
        url: request.url(),
        resourceType: request.resourceType(),
        failure: request.failure()
      });
    });

    page.on("crash", () => {
      write("[PageCrash]", {
        pageUrl: page.url()
      });
    });

    browser.on("disconnected", () => {
      write("[BROWSER_DISCONNECTED]", {});
      process.exit(0);
    });

    write("[READY]", {
      instruction:
        "Im verbundenen Chrome-Tab jetzt den Fehler reproduzieren. Danach Strg+C dr\u00fccken.",
      logPath
    });

    const shutdown = async () => {
      write("[STOPPED_BY_USER]", {
        note:
          "Listener beendet. Der verbundene Chrome wird ausdr\u00fccklich nicht geschlossen."
      });

      try {
        await cdp.detach();
      } catch {}

      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    await new Promise(() => {});
  } catch (error) {
    write("[FATAL]", {
      message: error.message,
      stack: error.stack
    });

    process.exitCode = 1;
  }
})();