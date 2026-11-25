package com.example.android_project.ui.calendar

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.example.android_project.R
import com.example.android_project.data.ScheduleRepository
import com.example.android_project.model.CreateScheduleRequest
import com.example.android_project.model.Schedule
import com.example.android_project.util.ApiError
import com.google.gson.JsonObject
import androidx.core.content.ContextCompat
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.format.DateTimeFormatter

// 일정 추가·수정. 추가할 때는 캘린더에서 고른 날짜(EXTRA_DATE)로 미리 채운다.
class ScheduleFormActivity : com.example.android_project.ui.BaseActivity() {

    companion object {
        const val EXTRA_ROOM_ID = "roomId"
        const val EXTRA_DATE = "date"              // yyyy-MM-dd

        // 수정할 때만 넘긴다.
        const val EXTRA_SCHEDULE_ID = "scheduleId"
        const val EXTRA_TITLE = "title"
        const val EXTRA_DESCRIPTION = "description"
        const val EXTRA_VISIBILITY = "visibility"
        const val EXTRA_START_AT = "startAt"
        const val EXTRA_END_AT = "endAt"
        const val EXTRA_REMINDER = "reminder"      // 시작 몇 분 전. -1이면 알림 없음
    }

    private val dateFormat = DateTimeFormatter.ofPattern("yyyy년 M월 d일 (E)", java.util.Locale.KOREAN)
    private val timeFormat = DateTimeFormatter.ofPattern("HH:mm")
    private val requestFormat = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")

    private lateinit var repo: ScheduleRepository
    private lateinit var etTitle: EditText
    private lateinit var tvStartDate: TextView
    private lateinit var tvStartTime: TextView
    private lateinit var tvEndDate: TextView
    private lateinit var tvEndTime: TextView
    private lateinit var btnSave: Button
    private lateinit var etDescription: EditText
    private lateinit var tabShared: TextView
    private lateinit var tabPersonal: TextView
    private lateinit var tvVisibilityHint: TextView

    private var roomId = 0
    private var scheduleId = 0

    // 시작 몇 분 전에 알릴지. null이면 알림 없음
    private var reminder: Int? = 60
    private var customMode = false
    private var customUnit = 60 // 분 단위로 환산할 때 곱할 값: 1(분) / 60(시간) / 1440(일)
    private lateinit var layoutReminderChips: android.widget.LinearLayout
    private lateinit var layoutReminderUnits: android.widget.LinearLayout
    private lateinit var layoutReminderCustom: android.view.View
    private lateinit var etReminderValue: EditText
    private lateinit var tvReminderHint: TextView

    private val presets = listOf<Pair<String, Int?>>(
        "없음" to null, "정각" to 0, "10분 전" to 10, "30분 전" to 30, "1시간 전" to 60, "1일 전" to 1440
    )

    // SHARED(방 구성원 모두) / PERSONAL(나만)
    private var visibility = "SHARED"
    private var originalVisibility = "SHARED"

    private lateinit var start: LocalDateTime
    private lateinit var end: LocalDateTime

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_schedule_form)

        roomId = intent.getIntExtra(EXTRA_ROOM_ID, 0)
        scheduleId = intent.getIntExtra(EXTRA_SCHEDULE_ID, 0)
        repo = ScheduleRepository(this)

        etTitle = findViewById(R.id.etScheduleTitle)
        tvStartDate = findViewById(R.id.tvStartDate)
        tvStartTime = findViewById(R.id.tvStartTime)
        tvEndDate = findViewById(R.id.tvEndDate)
        tvEndTime = findViewById(R.id.tvEndTime)
        btnSave = findViewById(R.id.btnSaveSchedule)
        etDescription = findViewById(R.id.etScheduleDescription)
        tabShared = findViewById(R.id.tabShared)
        tabPersonal = findViewById(R.id.tabPersonal)
        tvVisibilityHint = findViewById(R.id.tvVisibilityHint)

        findViewById<ImageView>(R.id.ivBack).setOnClickListener { finish() }

        tabShared.setOnClickListener { visibility = "SHARED"; renderVisibility() }
        tabPersonal.setOnClickListener { visibility = "PERSONAL"; renderVisibility() }

        if (scheduleId > 0) {
            findViewById<TextView>(R.id.tvFormTitle).text = "일정 수정"
            btnSave.text = "저장하기"
            etTitle.setText(intent.getStringExtra(EXTRA_TITLE))
            etDescription.setText(intent.getStringExtra(EXTRA_DESCRIPTION).orEmpty())
            originalVisibility = intent.getStringExtra(EXTRA_VISIBILITY) ?: "SHARED"
            visibility = originalVisibility
            start = Schedule.parse(intent.getStringExtra(EXTRA_START_AT).orEmpty())
            end = Schedule.parse(intent.getStringExtra(EXTRA_END_AT).orEmpty())
            val r = intent.getIntExtra(EXTRA_REMINDER, 60)
            reminder = if (r < 0) null else r
            customMode = reminder != null && presets.none { it.second == reminder }
        } else {
            val date = intent.getStringExtra(EXTRA_DATE)?.let { LocalDate.parse(it) } ?: LocalDate.now()
            start = date.atTime(9, 0)
            end = date.atTime(10, 0)
        }

        tvStartDate.setOnClickListener { pickDate(start.toLocalDate()) { setStart(it.atTime(start.toLocalTime())) } }
        tvStartTime.setOnClickListener { pickTime(start.toLocalTime()) { setStart(start.toLocalDate().atTime(it)) } }
        tvEndDate.setOnClickListener { pickDate(end.toLocalDate()) { end = it.atTime(end.toLocalTime()); render() } }
        tvEndTime.setOnClickListener { pickTime(end.toLocalTime()) { end = end.toLocalDate().atTime(it); render() } }

        btnSave.setOnClickListener { save() }

        setupReminder()
        render()
        renderVisibility()
    }

    // ---------------------------------------------------------------
    // 알림 시간: 없음 / 정각 / 10분 / 30분 / 1시간 / 1일 전 중에서 고르거나 직접 입력한다.
    // ---------------------------------------------------------------

    private fun chip(text: String, onClick: () -> Unit): TextView =
        TextView(this).apply {
            this.text = text
            setPadding((16 * resources.displayMetrics.density).toInt(), (8 * resources.displayMetrics.density).toInt(),
                (16 * resources.displayMetrics.density).toInt(), (8 * resources.displayMetrics.density).toInt())
            textSize = 14f
            setTypeface(null, android.graphics.Typeface.BOLD)
            val lp = android.widget.LinearLayout.LayoutParams(
                android.view.ViewGroup.LayoutParams.WRAP_CONTENT, android.view.ViewGroup.LayoutParams.WRAP_CONTENT
            )
            lp.marginEnd = (8 * resources.displayMetrics.density).toInt()
            layoutParams = lp
            setOnClickListener { onClick() }
        }

    private fun styleChip(chip: TextView, on: Boolean) {
        chip.setBackgroundResource(if (on) R.drawable.bg_chip_on else R.drawable.bg_chip_off)
        chip.setTextColor(getColor(if (on) R.color.white else R.color.rm_sub))
    }

    private fun setupReminder() {
        layoutReminderChips = findViewById(R.id.layoutReminderChips)
        layoutReminderUnits = findViewById(R.id.layoutReminderUnits)
        layoutReminderCustom = findViewById(R.id.layoutReminderCustom)
        etReminderValue = findViewById(R.id.etReminderValue)
        tvReminderHint = findViewById(R.id.tvReminderHint)

        for ((label, minutes) in presets) {
            layoutReminderChips.addView(chip(label) { customMode = false; reminder = minutes; renderReminder() })
        }
        layoutReminderChips.addView(chip("직접 입력") {
            customMode = true
            if (reminder == null) reminder = 30
            fillCustomFields()
            renderReminder()
        })
        for ((label, unit) in listOf("분" to 1, "시간" to 60, "일" to 1440)) {
            layoutReminderUnits.addView(chip(label) { customUnit = unit; applyCustom(); renderReminder() })
        }
        etReminderValue.addTextChangedListener(object : android.text.TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: android.text.Editable?) {
                if (customMode && etReminderValue.hasFocus()) { applyCustom(); renderReminder() }
            }
        })
        if (customMode) fillCustomFields()
        renderReminder()
    }

    // 직접 입력 칸을 현재 값(분)에서 보기 좋은 단위로 채운다.
    private fun fillCustomFields() {
        val m = reminder ?: 30
        customUnit = when {
            m != 0 && m % 1440 == 0 -> 1440
            m != 0 && m % 60 == 0 -> 60
            else -> 1
        }
        etReminderValue.setText((m / customUnit).toString())
    }

    private fun applyCustom() {
        val v = etReminderValue.text.toString().trim().toIntOrNull()
        reminder = if (v == null) null else (v.toLong() * customUnit).coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
    }

    private fun renderReminder() {
        for (i in 0 until layoutReminderChips.childCount) {
            val c = layoutReminderChips.getChildAt(i) as TextView
            val on = if (i < presets.size) !customMode && presets[i].second == reminder else customMode
            styleChip(c, on)
        }
        layoutReminderCustom.visibility = if (customMode) android.view.View.VISIBLE else android.view.View.GONE
        for (i in 0 until layoutReminderUnits.childCount) {
            styleChip(layoutReminderUnits.getChildAt(i) as TextView, listOf(1, 60, 1440)[i] == customUnit)
        }
        val r = reminder
        tvReminderHint.text = when {
            customMode && r == null -> "알림 시간을 숫자로 입력해 주세요. (최대 30일 전)"
            r == null -> "알림을 받지 않아요."
            r == 0 -> "일정이 시작될 때 알려 드려요."
            r > 43200 -> "알림은 최대 30일 전까지 설정할 수 있어요."
            else -> "시작 ${reminderText(r)} 전에 알려 드려요. 공유 일정은 방 구성원 모두에게 알려요."
        }
    }

    private fun reminderText(m: Int): String = when {
        m % 1440 == 0 -> "${m / 1440}일"
        m % 60 == 0 -> "${m / 60}시간"
        m > 60 -> "${m / 60}시간 ${m % 60}분"
        else -> "${m}분"
    }

    // 공유/개인 탭과 설명 문구를 현재 선택에 맞춰 다시 그린다.
    private fun renderVisibility() {
        val primary = ContextCompat.getColor(this, R.color.rm_primary)
        val sub = ContextCompat.getColor(this, R.color.rm_sub)

        fun segment(tab: TextView, on: Boolean) {
            if (on) {
                tab.setBackgroundResource(R.drawable.bg_card_white_plain)
                tab.setTextColor(primary)
            } else {
                tab.background = null
                tab.setTextColor(sub)
            }
        }

        segment(tabShared, visibility == "SHARED")
        segment(tabPersonal, visibility == "PERSONAL")
        tvVisibilityHint.text =
            if (visibility == "SHARED") "방 구성원 모두에게 보이는 일정이에요."
            else "나만 볼 수 있는 일정이에요. 다른 구성원에게는 보이지 않고, 알림은 나에게만 와요."
    }

    // 시작을 바꿨을 때 종료가 시작보다 앞서면 종료를 1시간 뒤로 맞춘다.
    private fun setStart(newStart: LocalDateTime) {
        start = newStart
        if (end.isBefore(start)) end = start.plusHours(1)
        render()
    }

    private fun render() {
        tvStartDate.text = start.toLocalDate().format(dateFormat)
        tvStartTime.text = start.toLocalTime().format(timeFormat)
        tvEndDate.text = end.toLocalDate().format(dateFormat)
        tvEndTime.text = end.toLocalTime().format(timeFormat)
    }

    private fun pickDate(current: LocalDate, onPicked: (LocalDate) -> Unit) {
        DatePickerDialog(
            this,
            { _, year, month, day -> onPicked(LocalDate.of(year, month + 1, day)) },
            current.year, current.monthValue - 1, current.dayOfMonth
        ).show()
    }

    private fun pickTime(current: LocalTime, onPicked: (LocalTime) -> Unit) {
        TimePickerDialog(
            this,
            { _, hour, minute -> onPicked(LocalTime.of(hour, minute)) },
            current.hour, current.minute, true
        ).show()
    }

    private fun save() {
        val title = etTitle.text.toString().trim()

        if (title.isEmpty()) {
            etTitle.error = "제목을 입력해 주세요."
            return
        }
        if (end.isBefore(start)) {
            com.example.android_project.util.Msg.makeText(this, "종료 시각은 시작 시각 이후여야 해요.", Toast.LENGTH_SHORT).show()
            return
        }

        val description = etDescription.text.toString().trim().ifEmpty { null }

        // 직접 입력인데 숫자가 없거나 범위를 벗어나면 저장하지 않는다.
        if (customMode) {
            applyCustom()
            val r = reminder
            if (r == null) {
                etReminderValue.error = "숫자를 입력해 주세요."
                return
            }
            if (r > 43200) {
                etReminderValue.error = "최대 30일 전까지예요."
                return
            }
        }

        btnSave.isEnabled = false

        lifecycleScope.launch {
            try {
                val response =
                    if (scheduleId > 0) {
                        // 수정: 내용은 비우면 null로 보내 지운다. 공개 범위는 바꿨을 때만 보낸다.
                        // (공개 범위는 작성자만 바꿀 수 있어서, 바꾸지 않았는데 보내면 방장이 수정할 때 거절된다.)
                        val changes = JsonObject().apply {
                            addProperty("title", title)
                            addProperty("description", description)
                            addProperty("startAt", start.format(requestFormat))
                            addProperty("endAt", end.format(requestFormat))
                            if (visibility != originalVisibility) addProperty("visibility", visibility)
                            addProperty("reminderMinutes", reminder)
                        }
                        repo.update(roomId, scheduleId, changes)
                    } else {
                        val body = JsonObject().apply {
                            addProperty("title", title)
                            addProperty("startAt", start.format(requestFormat))
                            addProperty("endAt", end.format(requestFormat))
                            if (description != null) addProperty("description", description)
                            addProperty("visibility", visibility)
                            addProperty("reminderMinutes", reminder)
                        }
                        repo.createJson(roomId, body)
                    }

                when {
                    response == null ->
                        com.example.android_project.util.Msg.makeText(this@ScheduleFormActivity, "로그인이 필요합니다.", Toast.LENGTH_SHORT).show()
                    response.isSuccessful -> {
                        com.example.android_project.util.Msg.makeText(
                            this@ScheduleFormActivity,
                            if (scheduleId > 0) "저장했어요." else "일정을 추가했어요.",
                            Toast.LENGTH_SHORT
                        ).show()
                        finish()
                    }
                    else -> com.example.android_project.util.Msg.makeText(
                        this@ScheduleFormActivity,
                        ApiError.messageOf(response, "저장하지 못했어요."),
                        Toast.LENGTH_LONG
                    ).show()
                }
            } catch (e: Exception) {
                com.example.android_project.util.Msg.makeText(
                    this@ScheduleFormActivity,
                    "서버에 연결할 수 없습니다.\n(${e.message})",
                    Toast.LENGTH_LONG
                ).show()
            } finally {
                btnSave.isEnabled = true
            }
        }
    }
}
