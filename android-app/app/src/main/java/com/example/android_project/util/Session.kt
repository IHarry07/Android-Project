package com.example.android_project.util

import android.content.Context
import android.content.Intent
import com.example.android_project.data.RetrofitClient
import com.example.android_project.ui.LoginActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/** 로그아웃: 서버에 이 로그인을 무효화해 달라고 알리고, 저장된 토큰을 지운 뒤 로그인 화면으로 간다. */
object Session {

    fun logout(context: Context, message: String? = null) {
        val app = context.applicationContext
        val token = TokenManager(app).getToken()
        if (token != null) {
            // 응답을 기다리지 않는다. (서버에 닿지 않아도 이 폰에서는 로그아웃된다)
            CoroutineScope(Dispatchers.IO).launch {
                try {
                    RetrofitClient.apiService.logout("Bearer $token")
                } catch (_: Exception) {
                }
            }
        }
        TokenManager(app).clearToken()
        if (message != null) Msg.showOnNextScreen(message)
        context.startActivity(
            Intent(context, LoginActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        )
    }
}