package com.example.android_project.ui.cleaning

import android.app.DatePickerDialog
import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.widget.EditText
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.example.android_project.R
import com.example.android_project.data.RoomRepository
import com.example.android_project.data.ScheduleRepository
import com.example.android_project.data.UserRepository
import com.example.android_project.model.CleaningActionRequest
import com.example.android_project.model.CleaningEvent
import com.example.android_project.model.CleaningTask
import com.example.android_project.model.PostponeCleaningRequest
import com.example.android_project.model.ReassignCleaningRequest
import com.example.android_project.model.RoomMember
import com.example.android_project.util.ApiError
import com.google.gson.Gson
import kotlinx.coroutines.launch
import retrofit2.Response
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * 청소 현황: 이번에 할 청소 목록과 처리(완료 / 건너뛰기 / 미루기), 이력.
 * 방 구성원 누구나 완료·건너뛰기를 할 수 있고, 미루기는 담당자·방장(또는 담당자가 없을 때 누구나)만 할 수 있다.
 * 처리할 때는 화면에 보이던 예정일(dueDate)을 같이 보내서, 그 사이 다른 사람이 먼저 처리했다면 서버가 거절한다.
 */
class CleaningStatusActivity : com.example.android_project.ui.BaseActivity() {

    companion object {
        const val EXTRA_ROOM_ID = "roomId"
        const val EXTRA_ROOM_NAME = "roomName"
    }

    private lateinit var repo: ScheduleRepository
    private lateinit var roomRepo: RoomRepository
    private lateinit var userRepo: UserRepository
    private lateinit var adapter: CleaningTaskAdapter
    private lateinit var tvEmpty: TextView
    private lateinit var tvHint: TextView

    private var roomId = 0
    private var roomName = ""

    // 내 회원번호. 완료 버튼을 담당자에게만 보여주려고 쓴다.
    private var myUserId: Int? = null

    // 요청이 진행 중일 때 같은 처리를 또 누르지 못하게 한다.
    private var busy = false

    private val dateFormat = DateTimeFormatter.ofPattern("M.d (E)", Locale.KOREAN)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_cleaning_status)

        roomId = intent.getIntExtra(EXTRA_ROOM_ID, 0)
        roomName = intent.getStringExtra(EXTRA_ROOM_NAME).orEmpty()
        repo = ScheduleRepository(this)
        roomRepo = RoomRepository(this)
        userRepo = UserRepository(this)

        tvEmpty = findViewById(R.id.tvStatusEmpty)
        tvHint = findViewById(R.id.tvStatusHint)
        findViewById<TextView>(R.id.tvStatusRoom).text = "$roomName · 함께 하는 청소"

        findViewById<ImageView>(R.id.ivBack).setOnClickListener { finish() }

        adapter = CleaningTaskAdapter(
            // 내 번호를 아직 모르면 버튼을 보여 준다. (담당자가 아니면 서버가 거절한다.)
            canDone = { task -> isMyTask(task) },
            onDone = { confirmDone(it) },
            onOpen = { showMenu(it) }
        )
        findViewById<RecyclerView>(R.id.rvCleaningTasks).apply {
            this.adapter = this@CleaningStatusActivity.adapter
            layoutManager = LinearLayoutManager(this@CleaningStatusActivity)
        }

        findViewById<View>(R.id.btnOpenHistory).setOnClickListener {
            startActivity(
                Intent(this, CleaningHistoryActivity::class.java)
                    .putExtra(CleaningHistoryActivity.EXTRA_ROOM_ID, roomId)
                    .putExtra(CleaningHistoryActivity.EXTRA_ROOM_NAME, roomName)
            )
        }

        findViewById<View>(R.id.btnOpenSettings).setOnClickListener {
            startActivity(
                Intent(this, CleaningSettingsActivity::class.java)
                    .putExtra(CleaningSettingsActivity.EXTRA_ROOM_ID, roomId)
                    .putExtra(CleaningSettingsActivity.EXTRA_ROOM_NAME, roomName)
            )
        }
    }

    // 설정을 바꾸고 돌아왔을 때도 최신 목록이 보이도록 화면에 들어올 때마다 불러온다.
    override fun onResume() {
        super.onResume()
        load()
    }

    // ---- 목록 ----

    private fun load() {
        lifecycleScope.launch {
            try {
                // 내 번호 (한 번만 불러온다)
                if (myUserId == null) {
                    val me = userRepo.getMe()
                    if (me != null && me.isSuccessful) {
                        me.body()?.getAsJsonObject("user")?.get("userId")?.takeIf { it.isJsonPrimitive }?.let { myUserId = it.asInt }
                    }
                }

                val response = repo.listCleaningTasks(roomId)

                when {
                    response == null -> toast("로그인이 필요합니다.")
                    response.isSuccessful -> {
                        val array = response.body()?.getAsJsonArray("tasks")
                        val tasks =
                            if (array == null) emptyList()
                            else Gson().fromJson(array, Array<CleaningTask>::class.java).toList()
                                .sortedBy { it.nextDueDate }

                        adapter.submit(tasks)
                        tvEmpty.visibility = if (tasks.isEmpty()) View.VISIBLE else View.GONE
                        tvHint.visibility = if (tasks.isEmpty()) View.GONE else View.VISIBLE
                    }
                    else -> toast(ApiError.messageOf(response, "청소 목록을 불러오지 못했어요."))
                }
            } catch (e: Exception) {
                toast("서버에 연결할 수 없습니다.\n(${e.message})")
            }
        }
    }

    // ---- 처리 메뉴 ----

    // 내가 이 청소의 담당자인지. (담당자가 없는 청소는 누구나 처리할 수 있고, 내 번호를 아직 모르면 서버 판단에 맡긴다.)
    private fun isMyTask(task: CleaningTask): Boolean =
        task.assignee?.userId == null || myUserId == null || task.assignee.userId == myUserId

    // 청소를 누르면: 담당자 바꾸기 / (담당자만) 건너뛰기 / 미루기 / 이력 보기
    private fun showMenu(task: CleaningTask) {
        // 건너뛰기는 완료처럼 담당자만 할 수 있어서, 담당자가 아니면 메뉴에 넣지 않는다.
        val entries = buildList {
            add("담당자 바꾸기" to { pickNewAssignee(task) })
            if (isMyTask(task)) add("건너뛰기" to { confirmSkip(task) })
            add("미루기" to { pickPostponeDate(task) })
            add("이력 보기" to { showHistory(task) })
        }

        com.google.android.material.dialog.MaterialAlertDialogBuilder(this)
            .setTitle(task.areaName)
            .setItems(entries.map { it.first }.toTypedArray()) { _, which -> entries[which].second() }
            .show()
    }

    // ---- 담당자 바꾸기 ----

    /**
     * 담당자 바꾸기: 새 담당자 고르기 → 이번 회차만 / 앞으로 계속 고르기 → 사유(선택) 입력.
     * 방 구성원 누구나 할 수 있고, 바꾸면 이력에 남는다.
     */
    private fun pickNewAssignee(task: CleaningTask) {
        lifecycleScope.launch {
            try {
                val response = roomRepo.getRoomMembers(roomId)
                val array = if (response != null && response.isSuccessful) {
                    response.body()?.getAsJsonArray("members")
                } else null

                val members =
                    if (array == null) emptyList()
                    else Gson().fromJson(array, Array<RoomMember>::class.java).toList()

                // 지금 담당자는 고를 수 없다.
                val candidates = members.filter { it.userId != task.assignee?.userId }
                if (candidates.isEmpty()) {
                    toast("바꿀 수 있는 다른 구성원이 없어요.")
                    return@launch
                }

                com.google.android.material.dialog.MaterialAlertDialogBuilder(this@CleaningStatusActivity)
                    .setTitle("새 담당자")
                    .setItems(candidates.map { it.nickname }.toTypedArray()) { _, which ->
                        pickScope(task, candidates[which])
                    }
                    .setNegativeButton("취소", null)
                    .show()
            } catch (e: Exception) {
                toast("서버에 연결할 수 없습니다.\n(${e.message})")
            }
        }
    }

    // 이번 회차만 대신할지, 앞으로 계속 바꿀지 고른다.
    private fun pickScope(task: CleaningTask, member: RoomMember) {
        val original = task.baseAssignee?.nickname ?: task.assignee?.nickname

        com.google.android.material.dialog.MaterialAlertDialogBuilder(this)
            .setTitle("${member.nickname}님으로 바꿀까요?")
            .setItems(
                arrayOf(
                    "이번 회차만 대신해요" + (original?.let { " (다음에는 ${it}님)" } ?: ""),
                    "앞으로 계속 바꿔요"
                )
            ) { _, which ->
                confirmReassign(task, member, if (which == 0) "ONCE" else "ALWAYS")
            }
            .setNegativeButton("취소", null)
            .show()
    }

    private fun confirmReassign(task: CleaningTask, member: RoomMember, scope: String) {
        val scopeText =
            if (scope == "ONCE") "이번 회차만 ${member.nickname}님이 대신하고, 다음에는 원래 담당자로 돌아가요."
            else "앞으로 계속 ${member.nickname}님이 담당해요."

        askWithMemo(
            "담당자 바꾸기",
            "'${task.areaName}' 청소 담당을 ${member.nickname}님으로 바꿀까요?\n$scopeText\n\n바꾼 내용은 이력에 남아요.",
            "바꾸기"
        ) { reason ->
            process(task, "담당자를 ${member.nickname}님으로 바꿨어요.") {
                repo.reassignCleaning(
                    roomId,
                    task.taskId,
                    ReassignCleaningRequest(
                        assigneeUserId = member.userId,
                        scope = scope,
                        reason = reason,
                        dueDate = task.nextDueDate
                    )
                )
            }
        }
    }

    // 메모를 함께 입력받는 확인 창. 메모는 비워도 된다. (비우면 null)
    private fun askWithMemo(
        title: String,
        message: String,
        positiveLabel: String,
        onConfirm: (memo: String?) -> Unit
    ) {
        val view = LayoutInflater.from(this).inflate(R.layout.dialog_cleaning_memo, null)
        view.findViewById<TextView>(R.id.tvMemoMessage).text = message
        val etMemo = view.findViewById<EditText>(R.id.etMemo)

        com.google.android.material.dialog.MaterialAlertDialogBuilder(this)
            .setTitle(title)
            .setView(view)
            .setPositiveButton(positiveLabel) { _, _ ->
                onConfirm(etMemo.text.toString().trim().ifEmpty { null })
            }
            .setNegativeButton("취소", null)
            .show()
    }

    // 완료. 예정일보다 이르게 누른 경우에만 먼저 "이르게 완료할까요?"를 한 번 더 묻는다.
    private fun confirmDone(task: CleaningTask) {
        val due = LocalDate.parse(task.nextDueDate.take(10))

        if (LocalDate.now().isBefore(due)) {
            com.google.android.material.dialog.MaterialAlertDialogBuilder(this)
                .setTitle("예정일보다 일러요")
                .setMessage(
                    "'${task.areaName}' 청소 예정일은 ${due.format(dateFormat)}이에요.\n" +
                        "예정일보다 이르게 완료할까요?"
                )
                .setPositiveButton("이르게 완료") { _, _ -> askDoneMemo(task) }
                .setNegativeButton("취소", null)
                .show()
        } else {
            askDoneMemo(task)
        }
    }

    private fun askDoneMemo(task: CleaningTask) {
        askWithMemo("청소 완료", "'${task.areaName}' 청소를 완료했나요?", "완료했어요") { memo ->
            process(task, "완료했어요.") {
                repo.completeCleaning(roomId, task.taskId, CleaningActionRequest(dueDate = task.nextDueDate, memo = memo))
            }
        }
    }

    private fun confirmSkip(task: CleaningTask) {
        askWithMemo(
            "건너뛰기",
            "이번 '${task.areaName}' 청소를 건너뛸까요?\n완료로 기록되지 않고 다음 청소로 넘어가요.",
            "건너뛰기"
        ) { memo ->
            process(task, "건너뛰었어요.") {
                repo.skipCleaning(roomId, task.taskId, CleaningActionRequest(dueDate = task.nextDueDate, memo = memo))
            }
        }
    }

    /**
     * 미룰 날짜를 고른다.
     *  - 한 회차에 1번만 미룰 수 있다. (이미 미룬 청소는 다시 미룰 수 없다.)
     *  - 현재 예정일 다음 날부터, 오늘 이후, 예정일에서 최대 7일까지만 고를 수 있다.
     * 서버도 같은 규칙으로 검사한다.
     */
    private fun pickPostponeDate(task: CleaningTask) {
        if (task.isPostponed) {
            toast("이미 한 번 미룬 청소는 다시 미룰 수 없어요.")
            return
        }

        val due = LocalDate.parse(task.nextDueDate.take(10))
        val earliest = maxOf(due.plusDays(1), LocalDate.now())
        val latest = task.postponeUntil?.let { LocalDate.parse(it.take(10)) } ?: due.plusDays(7)

        if (earliest.isAfter(latest)) {
            toast("더 이상 미룰 수 없어요. 예정일에서 최대 7일까지만 미룰 수 있어요.")
            return
        }

        val zone = java.time.ZoneId.systemDefault()
        val picker = DatePickerDialog(
            this,
            { _, year, month, day ->
                val target = LocalDate.of(year, month + 1, day)
                askWithMemo(
                    "미루기",
                    "'${task.areaName}' 청소를 ${target.format(dateFormat)}으로 미룰까요?\n" +
                        "한 번 미루면 다시 미룰 수 없어요.",
                    "미루기"
                ) { memo ->
                    process(task, "${target.format(dateFormat)}으로 미뤘어요.") {
                        repo.postponeCleaning(
                            roomId,
                            task.taskId,
                            PostponeCleaningRequest(dueDate = task.nextDueDate, postponedTo = target.toString(), memo = memo)
                        )
                    }
                }
            },
            earliest.year, earliest.monthValue - 1, earliest.dayOfMonth
        )
        picker.datePicker.minDate = earliest.atStartOfDay(zone).toInstant().toEpochMilli()
        picker.datePicker.maxDate = latest.atStartOfDay(zone).toInstant().toEpochMilli()
        picker.setTitle("미룰 날짜 (${latest.format(dateFormat)}까지)")
        picker.show()
    }

    // ---- 서버에 처리 요청 ----

    private fun process(
        task: CleaningTask,
        successMessage: String,
        request: suspend () -> Response<com.google.gson.JsonObject>?
    ) {
        if (busy) return
        busy = true

        lifecycleScope.launch {
            try {
                val response = request()

                when {
                    response == null -> toast("로그인이 필요합니다.")
                    response.isSuccessful -> {
                        toast(successMessage + nextInfo(response))
                        load()
                    }
                    else -> {
                        val error = ApiError.parse(response, "처리하지 못했어요.")
                        toast(error.message)
                        // 다른 사람이 먼저 처리했거나 예정일이 바뀐 경우: 최신 목록으로 새로 고친다.
                        if (error.code == "STALE_DUE_DATE") load()
                    }
                }
            } catch (e: Exception) {
                toast("서버에 연결할 수 없습니다.\n(${e.message})")
            } finally {
                busy = false
            }
        }
    }

    // 처리 뒤 항목에 반영된 다음 예정일과 담당자 안내 (예: " 다음 청소는 12.5 (토), 담당 민서님이에요.")
    private fun nextInfo(response: Response<com.google.gson.JsonObject>): String {
        val json = response.body()?.getAsJsonObject("task") ?: return ""
        val task = Gson().fromJson(json, CleaningTask::class.java)

        if (!task.isActive) return " 반복이 없는 청소라 목록에서 빠져요."

        val date = LocalDate.parse(task.nextDueDate.take(10)).format(dateFormat)
        val who = task.assignee?.nickname?.let { ", 담당 ${it}님" } ?: ""
        return " 다음 청소는 $date$who 이에요."
    }

    // ---- 이력 ----

    // 한 청소의 이력: 완료·건너뜀·미룸과 담당자 변경을 함께 보여준다.
    private fun showHistory(task: CleaningTask) {
        lifecycleScope.launch {
            try {
                val response = repo.listCleaningHistory(roomId, task.taskId, 30)

                when {
                    response == null -> toast("로그인이 필요합니다.")
                    response.isSuccessful -> {
                        val array = response.body()?.getAsJsonArray("events")
                        val events =
                            if (array == null) emptyList()
                            else Gson().fromJson(array, Array<CleaningEvent>::class.java).toList()

                        com.google.android.material.dialog.MaterialAlertDialogBuilder(this@CleaningStatusActivity)
                            .setTitle("${task.areaName} 이력")
                            .setMessage(
                                if (events.isEmpty()) "아직 이력이 없어요."
                                else events.joinToString("\n\n") { describe(it) }
                            )
                            .setPositiveButton("확인", null)
                            .show()
                    }
                    else -> toast(ApiError.messageOf(response, "이력을 불러오지 못했어요."))
                }
            } catch (e: Exception) {
                toast("서버에 연결할 수 없습니다.\n(${e.message})")
            }
        }
    }

    // 이력 한 건: "11.21 (토) 완료" / "지우님이 했어요 (담당 민서님)" / "메모: ..."
    private fun describe(e: CleaningEvent): String {
        val head = "${CleaningEventText.date(e.dueDate)} ${CleaningEventText.title(e)}"
        val detail = CleaningEventText.detail(e)
        return if (detail.isEmpty()) head else "$head\n$detail"
    }

    private fun toast(message: String) {
        com.example.android_project.util.Msg.makeText(this, message, Toast.LENGTH_LONG).show()
    }
}
