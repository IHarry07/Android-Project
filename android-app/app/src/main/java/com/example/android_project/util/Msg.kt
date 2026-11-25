package com.example.android_project.util

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import android.widget.Toast
import androidx.core.content.ContextCompat
import com.example.android_project.R
import com.google.android.material.snackbar.Snackbar

/**
 * 짧은 안내 메시지. 시스템 토스트 대신 앱 안에서 뜨는 스낵바로 보여준다. (토스트에는 시스템이 앱 아이콘을 붙인다.)
 *  - 하단 메뉴바가 보이는 화면에서는 메뉴바 위에 뜬다.
 *  - 메시지를 띄운 직후 화면이 닫히면(저장하고 나가기 등) 메시지를 이전 화면으로 넘겨서 거기서 보여준다.
 *
 * 기존 Toast.makeText(...).show() 호출을 Msg.makeText(...).show() 로 그대로 바꿔 쓸 수 있다.
 */
object Msg {

    class Message(private val context: Context, private val text: CharSequence, private val duration: Int) {
        fun show() = Msg.show(context, text, duration == Toast.LENGTH_LONG)
    }

    fun makeText(context: Context, text: CharSequence?, duration: Int): Message = Message(context, text ?: "", duration)

    // 화면이 닫힌 뒤 다음 화면에서 보여줄 메시지
    private var pending: Pair<CharSequence, Boolean>? = null

    // 가장 최근에 띄운 메시지 (닫히는 화면에서 넘겨주기 위해 기억한다.)
    private var lastActivity: Activity? = null
    private var lastText: CharSequence? = null
    private var lastLong = false
    private var lastShownAt = 0L

    fun show(context: Context, text: CharSequence, long: Boolean = false) {
        val activity = context.findActivity()
        if (activity == null) {
            Toast.makeText(context.applicationContext, text, if (long) Toast.LENGTH_LONG else Toast.LENGTH_SHORT).show()
            return
        }
        if (activity.isFinishing || activity.isDestroyed) {
            pending = text to long
            return
        }
        val root = activity.findViewById<View>(android.R.id.content) ?: return

        val snackbar = Snackbar.make(root, text, if (long) Snackbar.LENGTH_LONG else Snackbar.LENGTH_SHORT)
        val view = snackbar.view
        val dp = activity.resources.displayMetrics.density

        view.background = GradientDrawable().apply {
            cornerRadius = 16 * dp
            // 밝은 모드든 어두운 모드든 흰 바탕에 검은 글씨로 보여서 오류 이유가 눈에 띄게 한다.
            setColor(Color.WHITE)
            setStroke((1 * dp).toInt(), Color.parseColor("#D9D9D9"))
        }
        // Material 스낵바가 배경에 자체 색조(회색)를 입히므로, 그 색조를 흰색으로 덮어쓴다.
        view.backgroundTintList = android.content.res.ColorStateList.valueOf(Color.WHITE)
        snackbar.setBackgroundTint(Color.WHITE)
        view.elevation = 6 * dp
        (view.layoutParams as? ViewGroup.MarginLayoutParams)?.let {
            val m = (16 * dp).toInt()
            it.setMargins(m, m, m, m)
            view.layoutParams = it
        }
        view.findViewById<TextView>(com.google.android.material.R.id.snackbar_text)?.apply {
            setTextColor(Color.BLACK)
            textSize = 15f
            maxLines = 4
        }

        val nav = activity.findViewById<View>(R.id.navBar)
        if (nav != null && nav.visibility == View.VISIBLE) snackbar.anchorView = nav

        snackbar.show()

        lastActivity = activity
        lastText = text
        lastLong = long
        lastShownAt = System.currentTimeMillis()
    }

    /** 다음에 열리는 화면에서 보여줄 메시지를 예약한다. (화면을 전부 닫고 로그인 화면으로 가는 경우 등) */
    fun showOnNextScreen(text: CharSequence) {
        pending = text to false
    }

    /** 화면이 닫힐 때 호출한다. 방금 띄운 메시지가 아직 떠 있다면 다음 화면으로 넘긴다. */
    fun handOver(activity: Activity) {
        if (lastActivity === activity && System.currentTimeMillis() - lastShownAt < 3500) {
            pending = (lastText ?: return) to lastLong
        }
        if (lastActivity === activity) lastActivity = null
    }

    /** 화면이 다시 보일 때 호출한다. 넘겨받은 메시지가 있으면 보여준다. */
    fun showPending(activity: Activity) {
        val p = pending ?: return
        pending = null
        activity.window.decorView.post { show(activity, p.first, p.second) }
    }

    private fun Context.findActivity(): Activity? {
        var c: Context? = this
        while (c is ContextWrapper) {
            if (c is Activity) return c
            c = c.baseContext
        }
        return null
    }
}