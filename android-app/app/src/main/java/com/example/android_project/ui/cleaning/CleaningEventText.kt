package com.example.android_project.ui.cleaning

import com.example.android_project.model.CleaningEvent
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

// 청소 이력 한 건을 화면에 보일 글자로 바꾼다. (청소 현황의 이력 창과 전체 이력 화면에서 함께 쓴다.)
object CleaningEventText {

    private val dateFormat = DateTimeFormatter.ofPattern("M.d (E)", Locale.KOREAN)

    fun date(text: String): String = LocalDate.parse(text.take(10)).format(dateFormat)

    // 제목: "완료", "건너뜀", "미룸 → 11.30 (월)", "담당자 변경"
    fun title(e: CleaningEvent): String = when (e.type) {
        "DONE" -> "완료"
        "SKIPPED" -> "건너뜀"
        "POSTPONED" -> "미룸 → ${e.postponedTo?.let { date(it) } ?: ""}"
        "REASSIGNED" -> "담당자 변경"
        else -> e.type
    }

    // 자세한 내용 (여러 줄)
    fun detail(e: CleaningEvent): String {
        val lines = mutableListOf<String>()

        when (e.type) {
            "DONE" -> {
                val doer = e.completedBy?.nickname
                val assignee = e.assignee?.nickname
                when {
                    doer == null -> {}
                    assignee != null && doer != assignee -> lines.add("${doer}님이 했어요 (담당 ${assignee}님)")
                    else -> lines.add("${doer}님이 했어요")
                }
            }
            "REASSIGNED" -> {
                val from = e.fromAssignee?.nickname ?: "담당자 없음"
                val to = e.toAssignee?.nickname ?: "담당자 없음"
                val scope = if (e.scope == "ONCE") "이번 회차만" else "앞으로 계속"
                lines.add("$from → ${to}님 ($scope)")
                e.changedBy?.nickname?.let { lines.add("${it}님이 바꿨어요") }
            }
            else -> e.assignee?.nickname?.let { lines.add("담당 ${it}님") }
        }

        e.memo?.takeIf { it.isNotBlank() }?.let {
            lines.add(if (e.type == "REASSIGNED") "사유: $it" else "메모: $it")
        }
        return lines.joinToString("\n")
    }
}
