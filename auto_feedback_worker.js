/**
 * Auto Feedback Cloudflare Worker
 * Forwards live in-game screenshots and match statistics to Telegram.
 * Supports dynamic routing & dynamic rebranding per rebrander via HTTP headers.
 */

// Enter your Telegram Bot Token from @BotFather:
const BOT_TOKEN = "7716990867:AAH2pkq14B2bHflg6LDKpEBE94H-djzS_-g";
// Enter your Telegram Channel/Group/User Numeric Chat ID (e.g. -1001234567890 or 1234567890):
const DEFAULT_CHAT_ID = "-1003949605523";

// Default Dynamic Rebranding (Used if not overridden in headers)
const DEFAULT_BRAND     = "NURMURODOV VIP MOD PREMIUM";
const DEFAULT_OWNER     = "@Nurmurodov_06_09";
const DEFAULT_DEVELOPER = "@Nurmurodov_06_09";
const DEFAULT_COMMUNITY = "@Nurmurodov_06_09";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method;

    // CORS Preflight
    if (method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "*"
        }
      });
    }

    // Health Check
    if (method === "GET") {
      return new Response("Auto Feedback Telegram Worker is ONLINE & READY!", {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    // Heartbeat Text Message
    if (method === "POST" && (url.pathname === "/heartbeat" || url.pathname.endsWith("/heartbeat"))) {
      try {
        const text = await request.text();
        const msg = text || "[FEEDBACK] Auto Feedback is active in game!";
        
        const targetChatId = request.headers.get("x-meta-chat-id") || request.headers.get("x-chat-id") || DEFAULT_CHAT_ID;
        const tgResp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: targetChatId,
            text: msg
          })
        });
        const result = await tgResp.text();
        return new Response(result, {
          status: tgResp.status,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      } catch (err) {
        return new Response("Heartbeat error: " + err.toString(), { status: 500 });
      }
    }

    // Screenshot Photo Upload
    if (method === "POST" && (url.pathname === "/screenshot" || url.pathname.endsWith("/screenshot") || url.pathname === "/")) {
      try {
        let rawBuffer = await request.arrayBuffer();
        let uint8 = new Uint8Array(rawBuffer);

        if (!uint8 || uint8.length < 10) {
          return new Response("Invalid payload: data too small", { status: 400 });
        }

        // Auto-decode Base64 if sent as encoded string
        const isBase64 = (uint8[0] === 0x2F && uint8[1] === 0x39 && uint8[2] === 0x6A) || // /9j/
                         (uint8[0] === 0x69 && uint8[1] === 0x56 && uint8[2] === 0x42) || // iVBOR
                         (request.headers.get("content-type") || "").includes("text") ||
                         (uint8[0] !== 0xFF && uint8[0] !== 0x89); // Not raw JPEG (0xFF 0xD8) and not raw PNG

        if (isBase64) {
          try {
            const textDecoder = new TextDecoder();
            let b64Text = textDecoder.decode(uint8).replace(/[\r\n\s\t]/g, "").trim();
            while (b64Text.length % 4 !== 0) {
              b64Text += "=";
            }
            const binaryStr = atob(b64Text);
            const decodedBytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) {
              decodedBytes[i] = binaryStr.charCodeAt(i);
            }
            if (decodedBytes.length > 50) {
              uint8 = decodedBytes;
            }
          } catch (e) {
            // Keep uint8 as raw if base64 decoding fails
          }
        }

        let mimeType = "image/jpeg";
        let filename = "feedback_shot.jpg";

        // Detect PNG magic bytes vs JPEG
        if (uint8[0] === 0x89 && uint8[1] === 0x50 && uint8[2] === 0x4E && uint8[3] === 0x47) {
          mimeType = "image/png";
          filename = "feedback_shot.png";
        } else if (uint8[0] === 0xFF && uint8[1] === 0xD8) {
          mimeType = "image/jpeg";
          filename = "feedback_shot.jpg";
        } else {
          mimeType = "image/jpeg";
          filename = "feedback_shot.jpg";
        }

        // Read Dynamic Target Chat ID & Dynamic Rebranding from Headers
        const targetChatId = request.headers.get("x-meta-chat-id") || request.headers.get("x-chat-id") || DEFAULT_CHAT_ID;
        const brandName    = request.headers.get("x-meta-brand") || DEFAULT_BRAND;
        const owner        = request.headers.get("x-meta-owner") || request.headers.get("x-meta-developer") || DEFAULT_OWNER;
        const developer    = owner;
        const community    = request.headers.get("x-meta-community") || DEFAULT_COMMUNITY;
        const isVictory    = request.headers.get("x-meta-chicken") === "true";

        let finalCaption = "";
        const captionB64 = request.headers.get("x-meta-caption-b64");
        if (captionB64) {
          try {
            const b64Bytes = Uint8Array.from(atob(captionB64), c => c.charCodeAt(0));
            finalCaption = new TextDecoder().decode(b64Bytes);
          } catch(e) {
            try { finalCaption = atob(captionB64); } catch(_) {}
          }
        } else if (request.headers.get("x-meta-caption")) {
          try { 
            finalCaption = decodeURIComponent(request.headers.get("x-meta-caption")); 
          } catch(e) { 
            finalCaption = request.headers.get("x-meta-caption"); 
          }
        }

        // Fallback default caption if none sent from Lua or if decoding was empty
        if (!finalCaption || finalCaption.trim().length === 0) {
          let playerName = "Player";
          const nameB64 = request.headers.get("x-meta-name-b64");
          if (nameB64) {
            try {
              const b64Bytes = Uint8Array.from(atob(nameB64), c => c.charCodeAt(0));
              playerName = new TextDecoder().decode(b64Bytes);
            } catch(e) {
              try { playerName = atob(nameB64); } catch(_) { playerName = request.headers.get("x-meta-name") || "Player"; }
            }
          } else {
            playerName = request.headers.get("x-meta-name") || "Player";
          }
          const playerUid   = request.headers.get("x-meta-uid") || "Unknown";
          const playerKills = request.headers.get("x-meta-kills") || "0";
          let playerRank    = request.headers.get("x-meta-rank") || "Ace";

          const segNum = parseInt(playerRank, 10);
          if (!isNaN(segNum) && segNum > 0) {
            const TIER_MAP = {
              101: "Bronze V", 102: "Bronze IV", 103: "Bronze III", 104: "Bronze II", 105: "Bronze I",
              201: "Silver V", 202: "Silver IV", 203: "Silver III", 204: "Silver II", 205: "Silver I",
              301: "Gold V", 302: "Gold IV", 303: "Gold III", 304: "Gold II", 305: "Gold I",
              401: "Platinum V", 402: "Platinum IV", 403: "Platinum III", 404: "Platinum II", 405: "Platinum I",
              501: "Diamond V", 502: "Diamond IV", 503: "Diamond III", 504: "Diamond II", 505: "Diamond I",
              601: "Crown V", 602: "Crown IV", 603: "Crown III", 604: "Crown II", 605: "Crown I",
              701: "Ace", 702: "Ace Master", 703: "Ace Dominator",
              801: "Conqueror"
            };
            if (TIER_MAP[segNum]) {
              playerRank = TIER_MAP[segNum];
            } else if (segNum >= 800) {
              playerRank = "Conqueror";
            } else if (segNum >= 703) {
              playerRank = "Ace Dominator";
            } else if (segNum >= 702) {
              playerRank = "Ace Master";
            } else if (segNum >= 700) {
              playerRank = "Ace";
            } else if (segNum >= 600) {
              playerRank = "Crown";
            } else if (segNum >= 500) {
              playerRank = "Diamond";
            } else if (segNum >= 400) {
              playerRank = "Platinum";
            } else if (segNum >= 300) {
              playerRank = "Gold";
            } else if (segNum >= 200) {
              playerRank = "Silver";
            } else if (segNum >= 100) {
              playerRank = "Bronze";
            }
          }

          const now = new Date();
          const timeStr = now.toLocaleTimeString("en-US", { hour12: true, timeZone: "Asia/Kolkata" });
          const dateStr = now.toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata" });

          finalCaption = 
`[ ${brandName} AUTO FEEDBACK ]
[ ${isVictory ? brandName + " VIP VICTORY" : brandName} ]

Player : ${playerName}
UID    : ${playerUid}
Time   : ${timeStr} | ${dateStr}
Kills  : ${isVictory ? playerKills + " Kills (Winner)" : playerKills + " Kills"}
Rank   : ${playerRank}
Build  : ${brandName}
---------------------------------
[ STATUS : ACTIVE & 100% SECURE ]

- Undetected & Anti-Ban Protected
- High-Performance ESP & Visuals
- Safe & Secure Match Verification

Owner : ${owner}
Community : ${community}`;
        }

        // Send Photo to Telegram
        const photoForm = new FormData();
        photoForm.append("chat_id", targetChatId);
        photoForm.append("photo", new Blob([uint8], { type: mimeType }), filename);
        photoForm.append("caption", finalCaption);

        const photoResp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
          method: "POST",
          body: photoForm
        });

        const photoResult = await photoResp.text();

        if (photoResp.ok) {
          return new Response(photoResult, {
            status: 200,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
          });
        }

        // Fallback: sendDocument if sendPhoto fails
        const docForm = new FormData();
        docForm.append("chat_id", targetChatId);
        docForm.append("document", new Blob([uint8], { type: mimeType }), filename);
        docForm.append("caption", finalCaption);

        const docResp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
          method: "POST",
          body: docForm
        });

        const docResult = await docResp.text();
        return new Response(docResult, {
          status: docResp.status,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      } catch (err) {
        return new Response("Screenshot error: " + err.toString(), { status: 500 });
      }
    }

    return new Response("Not Found", { status: 404 });
  }
};
