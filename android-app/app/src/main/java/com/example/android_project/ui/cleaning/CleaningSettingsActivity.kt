package com.example.android_project.ui.cleaning

import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.ItemTouchHelper
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.example.android_project.R
import com.example.android_project.data.RoomRepository
import com.example.android_project.data.ScheduleRepository
import com.example.android_project.data.UserRepository
import com.example.android_project.model.CleaningSettings
import com.example.android_project.model.RoomMember
import com.example.android_project.model.SaveCleaningRow
import com.example.android_project.model.SaveCleaningSettingsRequest
import com.example.android_project.model.User
import com.example.android_project.util.ApiError
import com.google.android.material.materialswitch.MaterialSwitch
import com.google.gson.Gson
import kotlinx.coroutines.launch
import java.util.Collections

/**
 * 청소당번 설정: 반복 주기, 구성원별 담당 구역·요일, 순번 순환.
 * 줄의 순서가 순번이다. (손잡이를 끌어 바꾼다.) 방 구성원 누구나 설정할 수 있다.
 */
class CleaningSettingsActivity : com.example.android_project.ui.BaseActivity() {

    companion object {
        const val EXTRA_ROOM_ID = "roomId"
        const val EXTRA_ROOM_NAME = "roomName"
    }

    private lateinit var scheduleRepo: ScheduleRepository
    private lateinit var roomRepo: RoomRepository
    private lateinit var userRepo: UserRepository
    private lateinit var adapter: CleaningRowAdapter

    private lateinit var chipDaily: TextView
    private lateinit var chipWeekly: TextView
    private lateinit var chipBiweekly: TextView
    private lateinit var chipMonthly: TextView
    private lateinit var chipOnce: TextView
    private lateinit var cardRotation: View
    private lateinit var tvRowSummary: TextView
    private lateinit var tvRotationTitle: TextView
    private lateinit var tvRotationHint: TextView
    private lateinit var switchRotation: MaterialSwitch
    private lateinit var btnSave: Button

    private var roomId = 0
    private var myUserId: Int? = null

    // 방 구성원 (담당자를 고를 때 쓴다)
    private var members: List<RoomMember> = emptyList()

    // DAILY(매일) / WEEKLY(매주) / BIWEEKLY(격주) / MONTHLY(매월) / NONE(한 번만)
    private var repeat = "WEEKLY"
    private var rotation = false

    private lateinit var touchHelper: ItemTouchHelper

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_cleaning_settings)

        roomId = intent.getIntExtra(EXTRA_ROOM_ID, 0)
        scheduleRepo = ScheduleRepository(this)
        roomRepo = RoomRepository(this)
        userRepo = UserRepository(this)

        findViewById<TextView>(R.id.tvSettingsRoom).text =
            "${intent.getStringExtra(EXTRA_ROOM_NAME).orEmpty()} · 함께 나누면 더 가벼워져요."

        chipDaily = findViewById(R.id.chipDaily)
        chipWeekly = findViewById(R.id.chipWeekly)
        chipBiweekly = findViewById(R.id.chipBiweekly)
        chipMonthly = findViewById(R.id.chipMonthly)
        chipOnce = findViewById(R.id.chipOnce)
        cardRotation = findViewById(R.id.cardRotation)
        tvRowSummary = findViewById(R.id.tvRowSummary)
        tvRotationTitle = findViewById(R.id.tvRotationTitle)
        tvRotationHint = findViewById(R.id.tvRotationHint)
        switchRotation = findViewById(R.id.switchRotation)
        btnSave = findViewById(R.id.btnSaveCleaning)

        findViewById<ImageView>(R.id.ivBack).setOnClickListener { finish() }

        chipDaily.setOnClickListener { setRepeat("DAILY") }
        chipWeekly.setOnClickListener { setRepeat("WEEKLY") }
        chipBiweekly.setOnClickListener { setRepeat("BIWEEKLY") }
        chipMonthly.setOnClickListener { setRepeat("MONTHLY") }
        chipOnce.setOnClickListener { setRepeat("NONE") }
        switchRotation.setOnCheckedChangeListener { _, checked -> rotation = checked; render() }

        adapter = CleaningRowAdapter(
            rows = mutableListOf(),
            myUserId = { myUserId },
            showWeekday = { repeat != "DAILY" },
            onPickMember = { pickMember(it) },
            onPickWeekday = { pickWeekday(it) },
            onRemove = { removeRow(it) },
            onStartDrag = { touchHelper.startDrag(it) }
        )

        val rv = findViewById<RecyclerView>(R.id.rvCleaningRows)
        rv.layoutManager = LinearLayoutManager(this)
        rv.adapter = adapter

        // 손잡이를 끌어 순번을 바꾼다. (길게 눌러 끌기는 쓰지 않고, 손잡이로만 시작한다.)
        touchHelper = ItemTouchHelper(object : ItemTouchHelper.SimpleCallback(
            ItemTouchHelper.UP or ItemTouchHelper.DOWN, 0
        ) {
            override fun isLongPressDragEnabled() = false

            override fun onMove(
                recyclerView: RecyclerView,
                viewHolder: RecyclerView.ViewHolder,
                target: RecyclerView.ViewHolder
            ): Boolean {
                val from = viewHolder.bindingAdapterPosition
                val to = target.bindingAdapterPosition
                Collections.swap(adapter.rows, from, to)
                adapter.notifyItemMoved(from, to)
                return true
            }

            override fun onSwiped(viewHolder: RecyclerView.ViewHolder, direction: Int) {}

            // 놓았을 때 순번 숫자를 다시 그린다.
            override fun clearView(recyclerView: RecyclerView, viewHolder: RecyclerView.ViewHolder) {
                super.clearView(recyclerView, viewHolder)
                recyclerView.post { adapter.notifyDataSetChanged() }
            }
        })
        touchHelper.attachToRecyclerView(rv)

        findViewById<TextView>(R.id.btnAddRow).setOnClickListener { addRow() }
        btnSave.setOnClickListener { save() }

        render()
        load()
    }

    // ---- 불러오기 ----

    private fun load() {
        lifecycleScope.launch {
            try {
                // 구성원과 내 번호(화면에 "(나)"를 붙이려고)
                val membersResponse = roomRepo.getRoomMembers(roomId)
                if (membersResponse != null && membersResponse.isSuccessful) {
                    val array = membersResponse.body()?.getAsJsonArray("members")
                    if (array != null) members = Gson().fromJson(array, Array<RoomMember>::class.java).toList()
                }

                val meResponse = userRepo.getMe()
                if (meResponse != null && meResponse.isSuccessful) {
                    meResponse.body()?.getAsJsonObject("user")?.let {
                        myUserId = Gson().fromJson(it, User::class.java).userId
                    }
                }

                val response = scheduleRepo.getCleaningSettings(roomId)
                when {
                    response == null -> toast("로그인이 필요합니다.")
                    response.isSuccessful -> {
                        val json = response.body()?.getAsJsonObject("settings") ?: return@launch
                        apply(Gson().fromJson(json, CleaningSettings::class.java))
                    }
                    else -> toast(ApiError.messageOf(response, "청소당번 설정을 불러오지 못했어요."))
                }
            } catch (e: Exception) {
                toast("서버에 연결할 수 없습니다.\n(${e.message})")
            }
        }
    }

    private fun apply(settings: CleaningSettings) {
        repeat = settings.repeat
        rotation = settings.rotation

        adapter.rows.clear()
        if (settings.rows.isNotEmpty()) {
            for (row in settings.rows) {
                adapter.rows.add(
                    CleaningRowState(
                        taskId = row.taskId,
                        userId = row.userId ?: -1,
                        nickname = row.nickname.orEmpty(),
                        area = row.areaName,
                        weekday = row.weekday
                    )
                )
            }
        } else {
            // 처음 설정할 때는 구성원마다 한 줄을 만들어 준다. (필요 없는 줄은 지우면 된다.)
            for (member in members) {
                adapter.rows.add(CleaningRowState(null, member.userId, member.nickname, "", 6))
            }
        }

        // 스위치 값을 코드로 바꿀 때 변경 감시가 다시 불리지 않게 한다.
        switchRotation.setOnCheckedChangeListener(null)
        switchRotation.isChecked = rotation
        switchRotation.setOnCheckedChangeListener { _, checked -> rotation = checked; render() }

        adapter.notifyDataSetChanged()
        render()
    }

    // ---- 화면 그리기 ----

    private fun render() {
        val white = ContextCompat.getColor(this, R.color.white)
        val sub = ContextCompat.getColor(this, R.color.rm_sub)

        fun chip(view: TextView, on: Boolean) {
            view.setBackgroundResource(if (on) R.drawable.bg_chip_on else R.drawable.bg_chip_off)
            view.setTextColor(if (on) white else sub)
        }
        chip(chipDaily, repeat == "DAILY")
        chip(chipWeekly, repeat == "WEEKLY")
        chip(chipBiweekly, repeat == "BIWEEKLY")
        chip(chipMonthly, repeat == "MONTHLY")
        chip(chipOnce, repeat == "NONE")

        // 한 번만 하는 청소는 다음 회차가 없어서 담당 구역을 바꾸는 순환이 의미 없다.
        cardRotation.visibility = if (repeat == "NONE") View.GONE else View.VISIBLE

        val people = adapter.rows.map { it.userId }.filter { it != -1 }.distinct().size
        tvRowSummary.text = if (rotation) "${people}명 · 순번대로 순환" else "${people}명"

        val word = when (repeat) {
            "DAILY" -> "매일"
            "BIWEEKLY" -> "격주"
            "MONTHLY" -> "매월"
            else -> "매주"
        }
        val next = when (repeat) {
            "DAILY" -> "내일은"
            "BIWEEKLY" -> "2주 뒤에는"
            "MONTHLY" -> "다음 달에는"
            else -> "다음 주에는"
        }
        tvRotationTitle.text = "$word 담당 구역 바꾸기"
        tvRotationHint.text =
            if (rotation) "손잡이를 끌어 순번을 정해요. $next 정한 순서대로 담당 구역이 바뀌어요."
            else "끄면 담당 구역이 바뀌지 않고 그대로 이어져요."
    }

    // 반복 주기를 바꾼다. 매일일 때는 줄의 요일 칸이 없어지므로 목록도 다시 그린다.
    private fun setRepeat(value: String) {
        repeat = value
        adapter.notifyDataSetChanged()
        render()
    }

    // ---- 줄 편집 ----

    private fun addRow() {
        if (members.isEmpty()) {
            toast("구성원을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.")
            return
        }
        pickMemberDialog { member ->
            adapter.rows.add(CleaningRowState(null, member.userId, member.nickname, "", 6))
            adapter.notifyItemInserted(adapter.rows.size - 1)
            render()
        }
    }

    private fun pickMember(index: Int) {
        pickMemberDialog { member ->
            adapter.rows[index].userId = member.userId
            adapter.rows[index].nickname = member.nickname
            adapter.notifyItemChanged(index)
            render()
        }
    }

    private fun pickMemberDialog(onPicked: (RoomMember) -> Unit) {
        if (members.isEmpty()) {
            toast("구성원을 불러오지 못했어요.")
            return
        }
        val labels = members.map { it.nickname + if (it.userId == myUserId) " (나)" else "" }.toTypedArray()
        com.google.android.material.dialog.MaterialAlertDialogBuilder(this)
            .setTitle("담당 구성원")
            .setItems(labels) { _, which -> onPicked(members[which]) }
            .show()
    }

    private fun pickWeekday(index: Int) {
        com.google.android.material.dialog.MaterialAlertDialogBuilder(this)
            .setTitle("담당 요일")
            .setSingleChoiceItems(WEEKDAY_NAMES, adapter.rows[index].weekday) { dialog, which ->
                adapter.rows[index].weekday = which
                adapter.notifyItemChanged(index)
                dialog.dismiss()
            }
            .show()
    }

    private fun removeRow(index: Int) {
        adapter.rows.removeAt(index)
        adapter.notifyItemRemoved(index)
        // 아래 줄들의 순번 숫자를 다시 그린다.
        adapter.notifyItemRangeChanged(index, adapter.rows.size - index)
        render()
    }

    // ---- 저장 ----

    private fun save() {
        val rows = adapter.rows

        if (rows.isEmpty()) {
            toast("담당 구역을 1개 이상 정해 주세요.")
            return
        }
        for ((i, row) in rows.withIndex()) {
            if (row.userId == -1) {
                toast("${i + 1}번 담당 구성원을 골라 주세요.")
                return
            }
            if (row.area.trim().isEmpty()) {
                toast("${i + 1}번 담당 구역을 입력해 주세요.")
                return
            }
        }

        val request = SaveCleaningSettingsRequest(
            repeat = repeat,
            rotation = rotation && repeat != "NONE",
            rows = rows.map {
                SaveCleaningRow(
                    taskId = it.taskId,
                    userId = it.userId,
                    areaName = it.area.trim(),
                    weekday = it.weekday
                )
            }
        )

        btnSave.isEnabled = false

        lifecycleScope.launch {
            try {
                val response = scheduleRepo.saveCleaningSettings(roomId, request)

                when {
                    response == null -> toast("로그인이 필요합니다.")
                    response.isSuccessful -> {
                        toast("청소당번을 저장했어요.")
                        finish()
                    }
                    else -> toast(ApiError.messageOf(response, "저장하지 못했어요."))
                }
            } catch (e: Exception) {
                toast("서버에 연결할 수 없습니다.\n(${e.message})")
            } finally {
                btnSave.isEnabled = true
            }
        }
    }

    private fun toast(message: String) {
        com.example.android_project.util.Msg.makeText(this, message, Toast.LENGTH_LONG).show()
    }
}
