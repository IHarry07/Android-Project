package com.example.android_project.ui.notification

import android.content.Intent
import android.view.View
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import com.example.android_project.R
import com.example.android_project.data.NotificationRepository
import kotlinx.coroutines.launch

/**
 * 화면 위쪽의 알림 종. 누르면 알림 목록이 열리고, 읽지 않은 알림 개수를 배지로 보여준다.
 * 화면에 들어올 때마다 refresh()를 불러 개수를 새로 가져온다.
 */
class NotificationBell(private val fragment: Fragment, private val bell: View) {

    private val badge: TextView = bell.findViewById(R.id.tvBellBadge)
    private val repo = NotificationRepository(fragment.requireContext())

    init {
        bell.setOnClickListener {
            fragment.startActivity(Intent(fragment.requireContext(), NotificationActivity::class.java))
        }
    }

    fun refresh() {
        fragment.viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = repo.unreadCount() ?: return@launch
                if (!response.isSuccessful) return@launch

                val count = response.body()?.get("unreadCount")?.takeIf { it.isJsonPrimitive }?.asInt ?: 0
                badge.text = if (count > 99) "99+" else count.toString()
                badge.visibility = if (count > 0) View.VISIBLE else View.GONE
            } catch (_: Exception) {
                // 서버에 연결할 수 없어도 화면은 그대로 둔다. (배지만 갱신하지 않는다.)
            }
        }
    }

    fun setVisible(visible: Boolean) {
        bell.visibility = if (visible) View.VISIBLE else View.GONE
    }
}
