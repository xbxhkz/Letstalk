package com.letstalk.app;

import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /**
     * Google sign-in runs in the system browser (Google blocks sign-in inside WebViews). When it
     * finishes, the server sends the browser to com.letstalk.app://auth?token=..., which reopens
     * this activity. We hand the one-time token to the start screen, which loads the saved server's
     * /api/auth/handoff in the WebView. That endpoint also requires a cookie that only this WebView
     * has, so a token delivered by another app is useless.
     *
     * BridgeActivity calls onNewIntent for the launch intent too, so this covers cold starts.
     */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        Uri data = intent == null ? null : intent.getData();
        if (data == null || bridge == null) return;
        if (!"com.letstalk.app".equals(data.getScheme()) || !"auth".equals(data.getHost())) return;
        String token = data.getQueryParameter("token");
        if (token == null || !token.matches("[A-Za-z0-9_-]{20,100}")) return; // error/cancel: just come back to the app
        bridge.getWebView().loadUrl(bridge.getLocalUrl() + "/?handoff=" + token);
    }
}
