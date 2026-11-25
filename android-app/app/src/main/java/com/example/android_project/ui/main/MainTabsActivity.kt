package com.example.android_project.ui.main

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.View
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import com.example.android_project.R
import com.example.android_project.model.Room
import com.example.android_project.notification.PhoneNotifications
import com.example.android_project.ui.calendar.CalendarFragment
import com.example.android_project.ui.profile.ProfileFragment
import com.example.android_project.ui.warehouse.WarehouseFragment

/**
 * 로그인 후 첫 화면. 아래 메뉴바(캘린더·창고·홈·검색·프로필)로 탭을 오간다.
 * 방이 없으면 메뉴바를 숨기고 홈(방 만들기/참가하기)만 보여준다.
 */
class MainTabsActivity : com.example.android_project.ui.BaseActivity() {

    companion object {
        const val EXTRA_TAB = "tab"
        const val TAB_CALENDAR = "CALENDAR"
        const val TAB_WAREHOUSE = "WAREHOUSE"
        const val TAB_HOME = "HOME"
    }

    private enum class Tab { CALENDAR, WAREHOUSE, HOME, SEARCH, PROFILE }

    private val notificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }



    // 홈 탭이 불러온 내 방. 없으면 null
    var currentRoom: Room? = null
        private set

    private lateinit var navBar: View
    private lateinit var navDivider: View
    private lateinit var tabViews: Map<Tab, LinearLayout>
    private var selected = Tab.HOME

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main_tabs)

        navBar = findViewById(R.id.navBar)
        navDivider = findViewById(R.id.navDivider)

        tabViews = mapOf(
            Tab.CALENDAR to findViewById(R.id.tabCalendar),
            Tab.WAREHOUSE to findViewById(R.id.tabWarehouse),
            Tab.HOME to findViewById(R.id.tabHome),
            Tab.SEARCH to findViewById(R.id.tabSearch),
            Tab.PROFILE to findViewById(R.id.tabProfile)
        )

        tabViews.forEach { (tab, view) -> view.setOnClickListener { select(tab) } }

        // 방이 확인되기 전까지는 메뉴바를 보이지 않는다.
        setNavVisible(false)

        if (savedInstanceState == null) {
            select(tabFrom(intent) ?: Tab.HOME)
        }

        // 앱이 꺼져 있어도 폰 알림창에 알림이 오도록 주기 확인을 시작한다.
        if (Build.VERSION.SDK_INT >= 33 && !PhoneNotifications.hasPermission(this)) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
        PhoneNotifications.start(this)

        // 이메일이 없는 회원은 이메일 등록 화면으로 보낸다. (비밀번호 찾기에 필요)
        if (savedInstanceState == null) requireEmail()
    }

    // 이메일이 없는 회원은 비밀번호를 찾을 수 없으므로, 먼저 이메일을 등록(인증)해야 앱을 쓸 수 있다.
    private fun requireEmail() {
        lifecycleScope.launch {
            try {
                val response = com.example.android_project.data.UserRepository(this@MainTabsActivity).getMe() ?: return@launch
                if (!response.isSuccessful) return@launch
                val user = response.body()?.getAsJsonObject("user") ?: return@launch
                val email = user.get("email")?.takeIf { it.isJsonPrimitive }?.asString
                if (!email.isNullOrEmpty()) return@launch
                startActivity(
                    Intent(this@MainTabsActivity, com.example.android_project.ui.EmailVerifyActivity::class.java)
                        .putExtra(com.example.android_project.ui.EmailVerifyActivity.EXTRA_MODE, com.example.android_project.ui.EmailVerifyActivity.MODE_REQUIRED)
                )
                finish()
            } catch (_: Exception) {
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        tabFrom(intent)?.let { select(it) }
    }

    /** 다른 탭(검색 결과 등)에서 원하는 탭으로 이동한다. */
    fun openTab(name: String) {
        when (name) {
            TAB_CALENDAR -> select(Tab.CALENDAR)
            TAB_WAREHOUSE -> select(Tab.WAREHOUSE)
            TAB_HOME -> select(Tab.HOME)
        }
    }

    private fun tabFrom(intent: Intent?): Tab? = when (intent?.getStringExtra(EXTRA_TAB)) {
        TAB_CALENDAR -> Tab.CALENDAR
        TAB_WAREHOUSE -> Tab.WAREHOUSE
        TAB_HOME -> Tab.HOME
        else -> null
    }
    // 홈 탭이 서버에서 내 방을 확인한 뒤 알려준다.
    fun onRoomLoaded(room: Room?) {
        currentRoom = room
        setNavVisible(room != null)

        // 방이 없어졌는데 다른 탭에 있으면(예: 다른 곳에서 방이 삭제됨) 홈으로 돌아간다.
        if (room == null && selected != Tab.HOME) {
            select(Tab.HOME)
        }
    }

    private fun setNavVisible(visible: Boolean) {
        val state = if (visible) View.VISIBLE else View.GONE
        navBar.visibility = state
        navDivider.visibility = state
    }

    private fun select(tab: Tab) {
        selected = tab

        val fragment: Fragment = when (tab) {
            Tab.HOME -> HomeFragment()
            Tab.WAREHOUSE -> WarehouseFragment()
            Tab.CALENDAR -> CalendarFragment()
            Tab.SEARCH -> com.example.android_project.ui.search.SearchFragment()
            Tab.PROFILE -> ProfileFragment()
        }

        supportFragmentManager.beginTransaction()
            .replace(R.id.tabContainer, fragment)
            .commit()

        updateNavStyle()
    }

    private fun updateNavStyle() {
        val primary = ContextCompat.getColor(this, R.color.rm_primary)
        val sub = ContextCompat.getColor(this, R.color.rm_sub)
        val title = ContextCompat.getColor(this, R.color.rm_title)

        tabViews.forEach { (tab, view) ->
            val on = tab == selected
            val pill = view.getChildAt(0) as FrameLayout
            val icon = pill.getChildAt(0) as ImageView
            val label = view.getChildAt(1) as TextView

            pill.setBackgroundResource(if (on) R.drawable.bg_nav_pill_on else R.drawable.bg_nav_pill_off)
            icon.setColorFilter(if (on) primary else sub)
            label.setTextColor(if (on) title else sub)
        }
    }
}
