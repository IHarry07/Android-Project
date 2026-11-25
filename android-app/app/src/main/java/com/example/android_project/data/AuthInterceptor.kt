package com.example.android_project.data

import android.content.Context
import android.content.Intent
import com.example.android_project.ui.LoginActivity
import com.example.android_project.util.ApiError
import com.example.android_project.util.TokenManager
import okhttp3.Interceptor
import okhttp3.Response

/**
 * 모든 응답을 확인해서 토큰 관련 규칙을 처리한다.
 *
 *  - X-Refreshed-Token 헤더가 오면 저장된 토큰을 새 토큰으로 교체한다.
 *    ("로그인 유지"를 체크하지 않은 토큰은 요청할 때마다 새 토큰이 온다.)
 *  - AUTH_REQUIRED  : 로그인 화면으로 이동
 *  - TOKEN_EXPIRED  : "보안상의 이유로 로그인이 해제되었습니다" 팝업 후 로그인 화면으로 이동
 *  - TOKEN_INVALID  : 팝업 없이 로그인 화면으로 이동
 */
class AuthInterceptor(context: Context) : Interceptor {

    private val appContext = context.applicationContext
    private val tokenManager = TokenManager(appContext)

    override fun intercept(chain: Interceptor.Chain): Response {
        val response = chain.proceed(chain.request())

        // 서버는 인증이 통과한 요청에만 이 헤더를 준다. 응답이 400, 409 같은 오류여도 새 토큰은 유효하므로 저장한다.
        val refreshed = response.header("X-Refreshed-Token")
        if (!refreshed.isNullOrBlank()) {
            tokenManager.saveToken(refreshed)
        }

        if (response.code == 401) {
            val body = response.peekBody(64 * 1024).string()

            when (ApiError.codeOf(body)) {
                "TOKEN_EXPIRED" -> moveToLogin(expired = true)
                "TOKEN_INVALID", "AUTH_REQUIRED" -> moveToLogin(expired = false)
            }
        }

        return response
    }

    private fun moveToLogin(expired: Boolean) {
        // 이미 토큰을 지웠다면 다른 요청이 먼저 처리한 것이므로 한 번만 이동한다.
        if (tokenManager.getToken() == null) return
        tokenManager.clearToken()

        val intent = Intent(appContext, LoginActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
            putExtra(LoginActivity.EXTRA_SESSION_EXPIRED, expired)
        }
        appContext.startActivity(intent)
    }
}
