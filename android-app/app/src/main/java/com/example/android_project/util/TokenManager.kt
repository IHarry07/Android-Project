package com.example.android_project.util

import android.content.Context

class TokenManager(context: Context) {

    private val appContext = context.applicationContext

    // 토큰을 저장할 공간
    private val preferences = context.getSharedPreferences(
        "roomade_token",
        Context.MODE_PRIVATE
    )

    // 토큰 저장
    fun saveToken(token: String) {
        preferences.edit()
            .putString("access_token", token)
            .apply()
    }

    // "로그인 유지"를 체크하고 로그인했는지. 체크했으면 앱을 다시 켜도 로그인 화면 없이 바로 들어간다.
    fun setKeepLogin(keep: Boolean) {
        preferences.edit().putBoolean("keep_login", keep).apply()
    }

    fun isKeepLogin(): Boolean = preferences.getBoolean("keep_login", false)

    // 저장된 토큰 가져오기
    fun getToken(): String? {
        return preferences.getString("access_token", null)
    }

    // 토큰 삭제 (로그아웃)
    fun clearToken() {
        preferences.edit()
            .remove("access_token")
            .remove("keep_login")
            .apply()
        // 로그아웃하면 폰 알림 확인도 멈춘다.
        com.example.android_project.notification.PhoneNotifications.stop(appContext)
    }
}
