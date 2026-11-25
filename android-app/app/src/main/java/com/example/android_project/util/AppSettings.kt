package com.example.android_project.util

import android.content.Context
import androidx.appcompat.app.AppCompatDelegate

/** 화면 모드(밝게/어둡게)와 글자 크기 설정. 이 기기에만 저장된다. */
object AppSettings {

    private const val PREFS = "roomade_app_settings"
    private const val KEY_THEME = "theme"
    private const val KEY_FONT = "font"
    private const val KEY_REPEAT_CLEANING = "repeat_cleaning"

    enum class Theme(val label: String, val mode: Int) {
        SYSTEM("기기 설정 따라가기", AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM),
        LIGHT("밝게", AppCompatDelegate.MODE_NIGHT_NO),
        DARK("어둡게", AppCompatDelegate.MODE_NIGHT_YES)
    }

    enum class FontSize(val label: String, val scale: Float) {
        SMALL("작게", 0.9f),
        NORMAL("보통", 1.0f),
        LARGE("크게", 1.15f),
        XLARGE("아주 크게", 1.3f)
    }

    private fun prefs(context: Context) =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun theme(context: Context): Theme =
        Theme.values().firstOrNull { it.name == prefs(context).getString(KEY_THEME, null) } ?: Theme.SYSTEM

    fun fontSize(context: Context): FontSize =
        FontSize.values().firstOrNull { it.name == prefs(context).getString(KEY_FONT, null) } ?: FontSize.NORMAL

    fun setTheme(context: Context, theme: Theme) {
        prefs(context).edit().putString(KEY_THEME, theme.name).apply()
        AppCompatDelegate.setDefaultNightMode(theme.mode)
    }

    fun setFontSize(context: Context, size: FontSize) {
        prefs(context).edit().putString(KEY_FONT, size.name).apply()
    }

    /** 반복 청소의 다음 예정일 이후 날짜도 캘린더에 계속 보여줄지. 기본은 다음 예정일 한 번만. */
    fun showRepeatingCleaning(context: Context): Boolean =
        prefs(context).getBoolean(KEY_REPEAT_CLEANING, false)

    fun setShowRepeatingCleaning(context: Context, show: Boolean) {
        prefs(context).edit().putBoolean(KEY_REPEAT_CLEANING, show).apply()
    }

    /** 앱을 시작할 때 저장된 화면 모드를 적용한다. */
    fun applyTheme(context: Context) {
        AppCompatDelegate.setDefaultNightMode(theme(context).mode)
    }
}