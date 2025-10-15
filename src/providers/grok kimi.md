const AUTHORIZATION_VALUE = "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs=1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
class GrokWebBot extends AbstractBot {
  csrfToken;
  conversationContext;
  constructor() {
    super();
  }
  async doSendMessage(H) {
    if (!(await requestHostPermission("https://*.twitter.com/"))) {
      throw new ChatError("Missing twitter.com permission", ErrorCode.MISSING_HOST_PERMISSION);
    }
    this.csrfToken ||= await this.readCsrfToken();
    if (!this.conversationContext) {
      const St = await this.getConversationId();
      this.conversationContext = {
        conversationId: St,
        messages: []
      };
    }
    this.conversationContext.messages.push({
      sender: 1,
      message: H.prompt
    });
    const ae = await fetch("https://grok.x.com/2/grok/add_response.json", {
      method: "POST",
      headers: {
        Authorization: AUTHORIZATION_VALUE,
        "x-csrf-token": this.csrfToken
      },
      body: JSON.stringify({
        conversationId: this.conversationContext.conversationId,
        responses: this.conversationContext.messages,
        systemPromptName: "fun"
      }),
      signal: H.signal
    });
    if (!ae.ok) {
      throw new Error(ae.status.toString() + " " + (await ae.text()));
    }
    const ht = new TextDecoder();
    let yt = "";
    for await (const St of streamAsyncIterable(ae.body)) {
      const At = ht.decode(St).split(`
`);
      for (const kt of At) {
        if (!kt) {
          continue;
        }
        const $t = JSON.parse(kt);
        if ($t.result) {
          if (!yt && !$t.result.message && $t.result.query) {
            H.onEvent({
              type: "UPDATE_ANSWER",
              data: {
                text: "_" + $t.result.query + "_"
              }
            });
          } else {
            const Nt = $t.result.message;
            if (Nt) {
              if (!Nt.startsWith("[link]")) {
                yt += Nt;
                H.onEvent({
                  type: "UPDATE_ANSWER",
                  data: {
                    text: yt
                  }
                });
              }
            }
          }
        }
      }
    }
    this.conversationContext.messages.push({
      sender: 2,
      message: yt
    });
    H.onEvent({
      type: "DONE"
    });
  }
  async getConversationId() {
    try {
      return (await ofetch("https://x.com/i/api/graphql/vvC5uy7pWWHXS2aDi1FZeA/CreateGrokConversation", {
        headers: {
          Authorization: AUTHORIZATION_VALUE,
          "x-csrf-token": this.csrfToken
        },
        method: "POST",
        body: {
          variables: {},
          queryId: "vvC5uy7pWWHXS2aDi1FZeA"
        }
      })).data.create_grok_conversation.conversation_id;
    } catch (H) {
      if (H instanceof FetchError) {
        if (H.status === 401) {
          throw new ChatError("Grok is only available to Twitter Premium+ subscribers", ErrorCode.GROK_UNAVAILABLE);
        }
        if (H.status === 451) {
          throw new ChatError("Grok is not available in your country", ErrorCode.GROK_UNAVAILABLE);
        }
        if (H.status === 403) {
          this.csrfToken = await this.readCsrfToken({
            refresh: true
          });
          return this.getConversationId();
        }
      }
      throw H;
    }
  }
  async readCsrfToken({
    refresh: H
  } = {}) {
    const ae = await Browser.runtime.sendMessage({
      type: "read-twitter-csrf-token",
      data: {
        refresh: H
      },
      target: "background"
    });
    if (!ae) {
      throw new ChatError("There is no logged-in Twitter account in this browser.", ErrorCode.TWITTER_UNAUTHORIZED);
    }
    return ae;
  }
  resetConversation() {
    this.conversationContext = undefined;
  }
  get name() {
    return "Grok";
  }
}
const scriptRel = "modulepreload";
const assetsURL = function (L) {
  return "/" + L;
};


class MoonshotWebBot extends AbstractBot {
  refreshToken;
  accessToken;
  model;
  onTokenRefreshed = false;
  conversationId;
  constructor() {
    super();
    this.initializeBot();
  }
  async initializeBot() {
    this.model = "kimi";
  }
  async refreshAccessToken() {
    const H = await fetch("https://kimi.moonshot.cn/api/auth/token/refresh", {
      headers: {
        Authorization: `Bearer ${this.refreshToken}`
      }
    });
    if (H.status === 401) {
      this.refreshToken = await this.readCsrfToken({
        refresh: true
      });
      return this.refreshAccessToken();
    }
    const ae = await H.json().catch(() => ({}));
    this.accessToken = ae.access_token;
    this.refreshToken = ae.refresh_token;
    return ae.accessToken;
  }
  async createChat() {
    return (await (await this.request("https://kimi.moonshot.cn/api/chat", {
      method: "POST",
      body: {
        is_example: false,
        name: "未命名会话"
      }
    })).json()).id;
  }
  async readCsrfToken({
    refresh: H
  } = {}) {
    const ae = await Browser.runtime.sendMessage({
      type: "read-moonshot-refresh-token",
      data: {
        refresh: H
      },
      target: "background"
    });
    if (!ae) {
      throw new ChatError("There is no logged-in Moonshot account in this browser.", ErrorCode.MOONSHOT_UNAUTHORIZED);
    }
    return ae;
  }
  async request(H, ae) {
    if (!this.accessToken && this.refreshToken) {
      await this.refreshAccessToken();
    }
    const ht = await fetch(H, {
      method: ae.method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.accessToken}`,
        Referer: "https://kimi.moonshot.cn/"
      },
      body: JSON.stringify(ae.body),
      signal: ae.signal,
      responseType: ae.responseType
    });
    if (ht.status === 401 && this.refreshToken) {
      await this.refreshAccessToken();
      return await this.request(H, ae);
    } else {
      return ht;
    }
  }
  async doSendMessage(H) {
    if (!(await requestHostPermission("https://*.moonshot.cn/"))) {
      throw new ChatError("Missing moonshot permission", ErrorCode.MISSING_HOST_PERMISSION);
    }
    this.refreshToken ||= await this.readCsrfToken();
    this.conversationId ||= await this.createChat();
    const ae = await this.request(`https://kimi.moonshot.cn/api/chat/${this.conversationId}/completion/stream`, {
      method: "POST",
      signal: H.signal,
      responseType: "stream",
      headers: {
        "Content-Type": "application/json"
      },
      body: {
        messages: [{
          role: "user",
          content: H.prompt
        }],
        refs: [],
        use_search: false
      }
    });
    let ht = "";
    await parseSSEResponse(ae, yt => {
      const St = JSON.parse(yt);
      if (St.event === "cmpl") {
        ht += St.text;
        H.onEvent({
          type: "UPDATE_ANSWER",
          data: {
            text: ht.trimStart()
          }
        });
      } else if (St.event === "all_done") {
        H.onEvent({
          type: "DONE"
        });
      }
    });
  }
  resetConversation() {
    this.conversationId = undefined;
  }
  get name() {
    return `Moonshot (webapp/${this.model})`;
  }
}
globalThis.jotaiAtomCache = globalThis.jotaiAtomCache || {
  cache: new Map(),
  get(L, H) {
    if (this.cache.has(L)) {
      return this.cache.get(L);
    } else {
      this.cache.set(L, H);
      return H;
    }
  }
};




[
  {
    "id": 1,
    "priority": 1,
    "action": {
      "type": "modifyHeaders",
      "requestHeaders": [
        {
          "header": "origin",
          "operation": "set",
          "value": "https://kimi.moonshot.cn"
        },
        {
          "header": "referer",
          "operation": "set",
          "value": "https://kimi.moonshot.cn"
        }
      ]
    },
    "condition": {
      "urlFilter": "kimi.moonshot.cn",
      "isUrlFilterCaseSensitive": false,
      "resourceTypes": ["xmlhttprequest", "websocket"]
    }
  }
]
