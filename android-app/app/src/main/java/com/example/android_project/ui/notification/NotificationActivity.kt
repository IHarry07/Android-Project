package com.example.android_project.ui.notification

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.example.android_project.R
import com.example.android_project.data.NotificationRepository
import com.example.android_project.model.AppNotification
import com.example.android_project.ui.main.MainTabsActivity
import com.google.gson.Gson
import com.google.gson.JsonObject
import kotlinx.coroutines.launch

/** 알림 목록. 누르면 해당 탭으로 이동하고, 길게 누르면 삭제한다. */
class NotificationActivity : com.example.android_project.ui.BaseActivity() {

    private lateinit var repo: NotificationRepository
    private lateinit var adapter: NotificationAdapter
    private lateinit var tvEmpty: TextView
    private lateinit var tvHint: TextView
    private lateinit var btnMore: Button
    private lateinit var chipAll: TextView
    private lateinit var chipUnread: TextView

    private var filter = "all"
    private var nextBeforeId: Int? = null
    private var loading = false
    private val gson = Gson()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_notifications)

        repo = NotificationRepository(this)
        tvEmpty = findViewById(R.id.tvNotiEmpty)
        tvHint = findViewById(R.id.tvNotiHint)
        btnMore = findViewById(R.id.btnNotiMore)
        chipAll = findViewById(R.id.chipNotiAll)
        chipUnread = findViewById(R.id.chipNotiUnread)

        adapter = NotificationAdapter(onClick = { open(it) }, onLongClick = { confirmDelete(it) })
        findViewById<RecyclerView>(R.id.rvNotifications).apply {
            layoutManager = LinearLayoutManager(this@NotificationActivity)
            adapter = this@NotificationActivity.adapter
        }

        findViewById<View>(R.id.ivBack).setOnClickListener { finish() }
        chipAll.setOnClickListener { setFilter("all") }
        chipUnread.setOnClickListener { setFilter("unread") }
        btnMore.setOnClickListener { load(append = true) }
        findViewById<View>(R.id.btnReadAll).setOnClickListener { readAll() }
        findViewById<View>(R.id.btnDeleteRead).setOnClickListener { confirmDeleteRead() }

        updateChips()
        load(append = false)
    }

    private fun setFilter(value: String) {
        if (filter == value) return
        filter = value
        updateChips()
        load(append = false)
    }

    private fun updateChips() {
        chipAll.setBackgroundResource(if (filter == "all") R.drawable.bg_chip_on else R.drawable.bg_chip_off)
        chipUnread.setBackgroundResource(if (filter == "unread") R.drawable.bg_chip_on else R.drawable.bg_chip_off)
        chipAll.setTextColor(getColor(if (filter == "all") R.color.white else R.color.rm_sub))
        chipUnread.setTextColor(getColor(if (filter == "unread") R.color.white else R.color.rm_sub))
    }

    private fun load(append: Boolean) {
        if (loading) return
        loading = true
        lifecycleScope.launch {
            try {
                val response = repo.list(filter, 30, if (append) nextBeforeId else null)
                if (response == null || !response.isSuccessful) {
                    if (response != null && response.code() != 401) toast("알림을 불러오지 못했어요.")
                    return@launch
                }
                val body: JsonObject = response.body() ?: return@launch
                val list = body.getAsJsonArray("notifications").map {
                    gson.fromJson(it, AppNotification::class.java)
                }
                nextBeforeId = body.get("nextBeforeId")?.takeIf { it.isJsonPrimitive }?.asInt
                adapter.submit(list, append)
                btnMore.visibility = if (nextBeforeId != null) View.VISIBLE else View.GONE
                refreshEmpty()
            } catch (e: Exception) {
                toast("서버에 연결할 수 없어요.")
            } finally {
                loading = false
            }
        }
    }

    private fun refreshEmpty() {
        val empty = adapter.isEmpty()
        tvEmpty.visibility = if (empty) View.VISIBLE else View.GONE
        tvEmpty.text = if (filter == "unread") "안 읽은 알림이 없어요." else "알림이 없어요."
        tvHint.visibility = if (empty) View.GONE else View.VISIBLE
    }

    private fun open(n: AppNotification) {
        if (!n.isRead) {
            lifecycleScope.launch {
                try {
                    if (repo.markRead(n.notificationId)?.isSuccessful == true) adapter.markRead(n.notificationId)
                } catch (_: Exception) {
                }
            }
        }

        // 지출 알림은 정산 화면으로 바로 이동한다.
        val roomId = n.roomId
        if (n.target?.type == "EXPENSE" && roomId != null) {
            startActivity(
                Intent(this, com.example.android_project.ui.expense.ExpenseActivity::class.java)
                    .putExtra(com.example.android_project.ui.expense.ExpenseActivity.EXTRA_ROOM_ID, roomId)
            )
            return
        }

        // 알림이 가리키는 대상에 맞는 탭으로 이동한다.
        val tab = when (n.target?.type) {
            "ITEM" -> MainTabsActivity.TAB_WAREHOUSE
            "SCHEDULE", "CLEANING_TASK" -> MainTabsActivity.TAB_CALENDAR
            else -> MainTabsActivity.TAB_HOME
        }
        startActivity(
            Intent(this, MainTabsActivity::class.java)
                .putExtra(MainTabsActivity.EXTRA_TAB, tab)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        )
        finish()
    }

    private fun confirmDelete(n: AppNotification) {
        com.google.android.material.dialog.MaterialAlertDialogBuilder(this)
            .setMessage("이 알림을 삭제할까요?")
            .setNegativeButton("취소", null)
            .setPositiveButton("삭제") { _, _ ->
                lifecycleScope.launch {
                    try {
                        if (repo.delete(n.notificationId)?.isSuccessful == true) {
                            adapter.remove(n.notificationId)
                            refreshEmpty()
                        } else toast("삭제하지 못했어요.")
                    } catch (e: Exception) {
                        toast("서버에 연결할 수 없어요.")
                    }
                }
            }
            .show()
    }

    private fun readAll() {
        lifecycleScope.launch {
            try {
                if (repo.markAllRead()?.isSuccessful == true) load(append = false) else toast("처리하지 못했어요.")
            } catch (e: Exception) {
                toast("서버에 연결할 수 없어요.")
            }
        }
    }

    private fun confirmDeleteRead() {
        com.google.android.material.dialog.MaterialAlertDialogBuilder(this)
            .setMessage("읽은 알림을 모두 삭제할까요?")
            .setNegativeButton("취소", null)
            .setPositiveButton("삭제") { _, _ ->
                lifecycleScope.launch {
                    try {
                        if (repo.deleteAllRead()?.isSuccessful == true) load(append = false) else toast("삭제하지 못했어요.")
                    } catch (e: Exception) {
                        toast("서버에 연결할 수 없어요.")
                    }
                }
            }
            .show()
    }

    private fun toast(msg: String) = com.example.android_project.util.Msg.makeText(this, msg, Toast.LENGTH_SHORT).show()
}
