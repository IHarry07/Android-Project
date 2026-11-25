package com.example.android_project

import android.app.Application
import com.example.android_project.data.RetrofitClient

class App : Application() {

    override fun onCreate() {
        super.onCreate()

        // 통신 계층이 토큰을 저장하고 로그인 화면으로 이동할 수 있도록 Context를 넘긴다.
        RetrofitClient.init(this)

        // 설정에서 고른 화면 모드(밝게/어둡게)를 적용한다.
        com.example.android_project.util.AppSettings.applyTheme(this)
    }
}
