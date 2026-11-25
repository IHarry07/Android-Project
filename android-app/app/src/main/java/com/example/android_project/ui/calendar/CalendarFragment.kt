package com.example.android_project.ui.calendar

import android.content.Intent
import android.graphics.Typeface
import android.os.Bundle
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.example.android_project.R
import com.example.android_project.data.ItemRepository
import com.example.android_project.data.ScheduleRepository
import com.example.android_project.model.CleaningTask
import com.example.android_project.model.Item
import com.example.android_project.model.Schedule
import com.example.android_project.ui.cleaning.CleaningStatusActivity
import com.example.android_project.ui.item.StockLoader
import com.example.android_project.ui.main.MainTabsActivity
import com.example.android_project.util.ApiError
import com.google.gson.Gson
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale

/**
 * 캘린더 탭: 월 달력 + 선택한 날짜의 목록.
 * 목록에는 방 공유 일정, 내 개인 일정, 청소 당번 예정일, 물품 유통기한이 함께 나온다.
 */
class CalendarFragment : Fragment() {

    private lateinit var repo: ScheduleRepository
    private lateinit var itemRepo: ItemRepository
    private lateinit var adapter: ScheduleAdapter

    private lateinit var tvMonth: TextView
    private lateinit var tvSelectedDate: TextView
    private lateinit var tvScheduleCount: TextView
    private lateinit var tvScheduleEmpty: TextView
    private lateinit var gridContainer: LinearLayout

    // 달력 칸 (6주 x 7일)
    private class Cell(val root: LinearLayout, val day: TextView, val dot: View)

    private val rows = mutableListOf<LinearLayout>()
    private val cells = mutableListOf<Cell>()

    private var month: YearMonth = YearMonth.now()
    private var selected: LocalDate = LocalDate.now()

    // 서버에서 불러온 것. 일정은 지금 달력에 보이는 기간(앞뒤 달 일부 포함)만 가져온다.
    private var schedules: List<Schedule> = emptyList()
    private var cleaningTasks: List<CleaningTask> = emptyList()
    private var expiryItems: List<Item> = emptyList()

    private val roomId: Int?
        get() = (activity as? MainTabsActivity)?.currentRoom?.roomId

    private val roomName: String
        get() = (activity as? MainTabsActivity)?.currentRoom?.roomName.orEmpty()

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View = inflater.inflate(R.layout.fragment_calendar, container, false)

    private lateinit var bell: com.example.android_project.ui.notification.NotificationBell

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        repo = ScheduleRepository(requireContext())
        itemRepo = ItemRepository(requireContext())
        bell = com.example.android_project.ui.notification.NotificationBell(this, view.findViewById(R.id.bell))

        tvMonth = view.findViewById(R.id.tvMonth)
        tvSelectedDate = view.findViewById(R.id.tvSelectedDate)
        tvScheduleCount = view.findViewById(R.id.tvScheduleCount)
        tvScheduleEmpty = view.findViewById(R.id.tvScheduleEmpty)
        gridContainer = view.findViewById(R.id.gridContainer)

        buildWeekdayRow(view.findViewById(R.id.weekdayRow))
        buildGrid()

        adapter = ScheduleAdapter { onEntryClicked(it) }
        view.findViewById<RecyclerView>(R.id.rvSchedules).apply {
            this.adapter = this@CalendarFragment.adapter
            layoutManager = LinearLayoutManager(requireContext())
        }

        view.findViewById<View>(R.id.btnPrevMonth).setOnClickListener { moveMonth(month.minusMonths(1)) }
        view.findViewById<View>(R.id.btnNextMonth).setOnClickListener { moveMonth(month.plusMonths(1)) }
        view.findViewById<View>(R.id.btnToday).setOnClickListener {
            selected = LocalDate.now()
            moveMonth(YearMonth.from(selected))
        }
        view.findViewById<View>(R.id.btnAddSchedule).setOnClickListener {
            val id = roomId ?: return@setOnClickListener
            startActivity(
                Intent(requireContext(), ScheduleFormActivity::class.java)
                    .putExtra(ScheduleFormActivity.EXTRA_ROOM_ID, id)
                    .putExtra(ScheduleFormActivity.EXTRA_DATE, selected.toString())
            )
        }

        render()
    }

    // 일정을 추가·수정하고 돌아왔을 때도 최신 상태가 보이도록 화면에 들어올 때마다 불러온다.
    override fun onResume() {
        super.onResume()
        bell.refresh()
        load()
    }

    private fun buildWeekdayRow(row: LinearLayout) {
        val sub = ContextCompat.getColor(requireContext(), R.color.rm_sub)
        for (name in listOf("일", "월", "화", "수", "목", "금", "토")) {
            row.addView(TextView(requireContext()).apply {
                layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
                gravity = Gravity.CENTER
                text = name
                setTextColor(sub)
                textSize = 14f
            })
        }
    }

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()

    private fun buildGrid() {
        repeat(6) { weekIndex ->
            val row = LinearLayout(requireContext()).apply {
                orientation = LinearLayout.HORIZONTAL
                layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(56))
            }

            repeat(7) { dayIndex ->
                val day = TextView(requireContext()).apply {
                    layoutParams = LinearLayout.LayoutParams(dp(40), dp(40))
                    gravity = Gravity.CENTER
                    textSize = 17f
                }
                val dot = View(requireContext()).apply {
                    layoutParams = LinearLayout.LayoutParams(dp(5), dp(5)).apply { topMargin = dp(3) }
                    setBackgroundResource(R.drawable.bg_dot)
                }
                val cell = LinearLayout(requireContext()).apply {
                    layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f)
                    orientation = LinearLayout.VERTICAL
                    gravity = Gravity.CENTER_HORIZONTAL
                    setPadding(0, dp(4), 0, 0)
                    addView(day)
                    addView(dot)
                }

                val index = weekIndex * 7 + dayIndex
                cell.setOnClickListener { onDayClicked(firstCellDate().plusDays(index.toLong())) }

                row.addView(cell)
                cells.add(Cell(cell, day, dot))
            }

            gridContainer.addView(row)
            rows.add(row)
        }
    }

    // 달력 첫 칸(일요일)의 날짜
    private fun firstCellDate(): LocalDate {
        val first = month.atDay(1)
        return first.minusDays((first.dayOfWeek.value % 7).toLong())
    }

    // 이 달을 보여주는 데 필요한 주 수 (5 또는 6)
    private fun weekCount(): Int {
        val offset = month.atDay(1).dayOfWeek.value % 7
        return (offset + month.lengthOfMonth() + 6) / 7
    }

    private fun lastCellDate(): LocalDate = firstCellDate().plusDays(weekCount() * 7L - 1)

    private fun onDayClicked(date: LocalDate) {
        selected = date
        if (YearMonth.from(date) != month) {
            moveMonth(YearMonth.from(date))
        } else {
            render()
        }
    }

    private fun moveMonth(newMonth: YearMonth) {
        month = newMonth
        // 선택한 날짜가 이 달 밖이면 오늘(이 달이면) 또는 1일로 옮긴다.
        if (YearMonth.from(selected) != month) {
            val today = LocalDate.now()
            selected = if (YearMonth.from(today) == month) today else month.atDay(1)
        }
        schedules = emptyList()
        render()
        load()
    }

    // ---- 서버에서 불러오기 ----

    private fun load() {
        val id = roomId ?: return
        val from = firstCellDate().toString()
        val to = lastCellDate().toString()

        viewLifecycleOwner.lifecycleScope.launch {
            // 일정 (실패하면 안내한다)
            try {
                val response = repo.list(id, from, to)
                when {
                    response == null -> toast("로그인이 필요합니다.")
                    response.isSuccessful -> {
                        // 그 사이 다른 달로 옮겼으면 이 결과는 버린다.
                        if (from == firstCellDate().toString()) {
                            val array = response.body()?.getAsJsonArray("schedules")
                            schedules =
                                if (array == null) emptyList()
                                else Gson().fromJson(array, Array<Schedule>::class.java).toList()
                            render()
                        }
                    }
                    else -> toast(ApiError.messageOf(response, "일정을 불러오지 못했어요."))
                }
            } catch (e: Exception) {
                toast("서버에 연결할 수 없습니다.\n(${e.message})")
                return@launch
            }

            // 청소 당번 예정일 (실패해도 일정은 그대로 보여준다)
            try {
                val response = repo.listCleaningTasks(id)
                if (response != null && response.isSuccessful) {
                    val array = response.body()?.getAsJsonArray("tasks")
                    cleaningTasks =
                        if (array == null) emptyList()
                        else Gson().fromJson(array, Array<CleaningTask>::class.java).toList()
                    render()
                }
            } catch (_: Exception) {
            }

            // 물품 유통기한 (공용 물품 + 내 물품)
            try {
                val (stock, _) = StockLoader.load(itemRepo, id)
                if (stock != null) {
                    expiryItems = stock.all.filter { it.expiryDate != null }
                    render()
                }
            } catch (_: Exception) {
            }
        }
    }

    // ---- 일정·청소·유통기한을 한 목록으로 ----

    private fun buildEntries(): List<CalendarEntry> {
        val timeFormat = DateTimeFormatter.ofPattern("HH:mm")
        val dateTimeFormat = DateTimeFormatter.ofPattern("M.d HH:mm")
        val today = LocalDate.now()
        val result = mutableListOf<CalendarEntry>()

        for (s in schedules) {
            val sameDay = s.start.toLocalDate() == s.end.toLocalDate()
            val prefix = if (s.isPersonal) "개인" else roomName
            val description = s.description?.takeIf { it.isNotBlank() }

            result.add(
                CalendarEntry(
                    kind = if (s.isPersonal) EntryKind.PERSONAL else EntryKind.SHARED,
                    startDate = s.start.toLocalDate(),
                    endDate = s.end.toLocalDate(),
                    sortKey = s.start,
                    timeLabel = s.start.format(timeFormat),
                    subLabel = if (sameDay) s.end.format(timeFormat) else s.end.format(dateTimeFormat),
                    title = s.title,
                    meta = "$prefix · ${s.durationText()}" + (description?.let { "\n$it" } ?: ""),
                    schedule = s
                )
            )
        }

        for (t in cleaningTasks) {
            val date = LocalDate.parse(t.nextDueDate.take(10))
            result.add(
                CalendarEntry(
                    kind = EntryKind.CLEANING,
                    startDate = date,
                    endDate = date,
                    sortKey = date.atStartOfDay(),
                    timeLabel = "청소",
                    subLabel = t.assignee?.nickname?.let { "당번 $it" } ?: "당번 미정",
                    title = t.areaName,
                    meta = if (t.isOverdue) "청소 · 예정일이 지났어요" else "청소"
                )
            )
        }

        // 설정에서 켜 두었다면 반복 청소의 다음 예정일 이후 날짜도 이 달 화면에 보여준다.
        if (com.example.android_project.util.AppSettings.showRepeatingCleaning(requireContext())) {
            val from = month.atDay(1).minusDays(7)
            val limit = month.atEndOfMonth().plusDays(7)
            for (t in cleaningTasks) {
                val type = t.repeatType ?: continue
                val step = (t.repeatInterval ?: 1).toLong()
                if (type == "NONE" || step < 1) continue
                // 순환이면 다음 회차 당번이 바뀌므로 이름 대신 "순환"으로, 이번만 대신하는 중이면 원래 당번으로 보여준다.
                val who = when {
                    t.rotationEnabled -> "당번 순환"
                    t.isSubstitute -> t.baseAssignee?.nickname?.let { "당번 $it" } ?: "당번 미정"
                    else -> t.assignee?.nickname?.let { "당번 $it" } ?: "당번 미정"
                }
                var date = LocalDate.parse(t.nextDueDate.take(10))
                var guard = 0
                while (guard++ < 400) {
                    date = when (type) {
                        "DAILY" -> date.plusDays(step)
                        "WEEKLY" -> date.plusWeeks(step)
                        "MONTHLY" -> date.plusMonths(step)
                        else -> break
                    }
                    if (date.isAfter(limit)) break
                    if (date.isBefore(from)) continue
                    result.add(
                        CalendarEntry(
                            kind = EntryKind.CLEANING,
                            startDate = date,
                            endDate = date,
                            sortKey = date.atStartOfDay(),
                            timeLabel = "청소",
                            subLabel = who,
                            title = t.areaName,
                            meta = "청소 · 반복 예정"
                        )
                    )
                }
            }
        }

        for (i in expiryItems) {
            val date = LocalDate.parse(i.expiryDate!!.take(10))
            val days = ChronoUnit.DAYS.between(today, date)
            val owner =
                if (i.ownershipType == "SHARED") "공용"
                else "개인" + (i.ownerNickname?.let { " ($it)" } ?: "")
            val where = i.storageLocation?.takeIf { it.isNotBlank() }?.let { " · $it" } ?: ""
            result.add(
                CalendarEntry(
                    kind = EntryKind.EXPIRY,
                    startDate = date,
                    endDate = date,
                    sortKey = date.atStartOfDay(),
                    timeLabel = "유통기한",
                    subLabel = when {
                        days < 0 -> "${-days}일 지남"
                        days == 0L -> "오늘까지"
                        else -> "D-$days"
                    },
                    title = i.name,
                    meta = "$owner · ${i.quantityText()}$where"
                )
            )
        }

        return result
    }

    private fun render() {
        val ctx = requireContext()
        val white = ContextCompat.getColor(ctx, R.color.white)
        val title = ContextCompat.getColor(ctx, R.color.rm_title)
        val hint = ContextCompat.getColor(ctx, R.color.rm_hint)
        val primary = ContextCompat.getColor(ctx, R.color.rm_primary)

        tvMonth.text = "${month.year}년 ${month.monthValue}월"

        val entries = buildEntries()
        val first = firstCellDate()
        val weeks = weekCount()
        val today = LocalDate.now()

        rows.forEachIndexed { index, row ->
            row.visibility = if (index < weeks) View.VISIBLE else View.GONE
        }

        cells.forEachIndexed { index, cell ->
            val date = first.plusDays(index.toLong())
            val isSelected = date == selected
            val inMonth = YearMonth.from(date) == month

            cell.day.text = date.dayOfMonth.toString()
            cell.day.setBackgroundResource(if (isSelected) R.drawable.bg_day_selected else 0)
            cell.day.setTextColor(
                when {
                    isSelected -> white
                    date == today -> primary
                    inMonth -> title
                    else -> hint
                }
            )
            cell.day.setTypeface(null, if (isSelected || date == today) Typeface.BOLD else Typeface.NORMAL)
            cell.dot.visibility =
                if (entries.any { it.coversDate(date) }) View.VISIBLE else View.INVISIBLE
        }

        // 선택한 날짜의 목록: 하루짜리(청소·유통기한)를 먼저, 그다음 시각 순
        val ofDay = entries
            .filter { it.coversDate(selected) }
            .sortedWith(compareBy<CalendarEntry>({ !it.isAllDay }, { it.sortKey }, { it.kind.ordinal }))

        tvSelectedDate.text =
            selected.format(DateTimeFormatter.ofPattern("M월 d일 EEEE", Locale.KOREAN))
        tvScheduleCount.text = "일정 ${ofDay.size}개"
        tvScheduleEmpty.visibility = if (ofDay.isEmpty()) View.VISIBLE else View.GONE
        adapter.submit(ofDay)
    }

    // ---- 항목을 눌렀을 때 ----

    private fun onEntryClicked(entry: CalendarEntry) {
        val schedule = entry.schedule
        when {
            schedule != null -> showActions(schedule)
            entry.kind == EntryKind.CLEANING -> openCleaningStatus()
            else ->
                toast("물품은 창고 탭에서 수정할 수 있어요.")
        }
    }

    // 청소 항목을 누르면 청소 현황 화면에서 완료·건너뛰기·미루기를 한다.
    private fun openCleaningStatus() {
        val id = roomId ?: return
        startActivity(
            Intent(requireContext(), CleaningStatusActivity::class.java)
                .putExtra(CleaningStatusActivity.EXTRA_ROOM_ID, id)
                .putExtra(CleaningStatusActivity.EXTRA_ROOM_NAME, roomName)
        )
    }

    private fun showActions(schedule: Schedule) {
        val id = roomId ?: return

        com.google.android.material.dialog.MaterialAlertDialogBuilder(requireContext())
            .setTitle(schedule.title)
            .setItems(arrayOf("수정", "삭제")) { _, which ->
                if (which == 0) {
                    startActivity(
                        Intent(requireContext(), ScheduleFormActivity::class.java)
                            .putExtra(ScheduleFormActivity.EXTRA_ROOM_ID, id)
                            .putExtra(ScheduleFormActivity.EXTRA_SCHEDULE_ID, schedule.scheduleId)
                            .putExtra(ScheduleFormActivity.EXTRA_TITLE, schedule.title)
                            .putExtra(ScheduleFormActivity.EXTRA_DESCRIPTION, schedule.description)
                            .putExtra(ScheduleFormActivity.EXTRA_VISIBILITY, schedule.visibility)
                            .putExtra(ScheduleFormActivity.EXTRA_START_AT, schedule.startAt)
                            .putExtra(ScheduleFormActivity.EXTRA_END_AT, schedule.endAt)
                .putExtra(ScheduleFormActivity.EXTRA_REMINDER, schedule.reminderMinutes ?: -1)
                    )
                } else {
                    confirmDelete(id, schedule)
                }
            }
            .show()
    }

    private fun confirmDelete(roomId: Int, schedule: Schedule) {
        com.google.android.material.dialog.MaterialAlertDialogBuilder(requireContext())
            .setMessage("'${schedule.title}' 일정을 삭제할까요?")
            .setPositiveButton("삭제") { _, _ ->
                viewLifecycleOwner.lifecycleScope.launch {
                    try {
                        val response = repo.delete(roomId, schedule.scheduleId)
                        when {
                            response == null -> toast("로그인이 필요합니다.")
                            response.isSuccessful -> load()
                            else -> toast(ApiError.messageOf(response, "삭제하지 못했어요."))
                        }
                    } catch (e: Exception) {
                        toast("서버에 연결할 수 없습니다.\n(${e.message})")
                    }
                }
            }
            .setNegativeButton("취소", null)
            .show()
    }

    private fun toast(message: String) {
        if (isAdded) com.example.android_project.util.Msg.makeText(requireContext(), message, Toast.LENGTH_LONG).show()
    }
}
