package com.example.android_project.ui.cleaning

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.TextView
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.RecyclerView
import com.example.android_project.R
import com.example.android_project.model.CleaningTask
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale

class CleaningTaskAdapter(
    private val canDone: (CleaningTask) -> Boolean,
    private val onDone: (CleaningTask) -> Unit,
    private val onOpen: (CleaningTask) -> Unit
) : RecyclerView.Adapter<CleaningTaskAdapter.Holder>() {

    private val tasks = mutableListOf<CleaningTask>()

    class Holder(view: View) : RecyclerView.ViewHolder(view) {
        val area: TextView = view.findViewById(R.id.tvTaskArea)
        val assignee: TextView = view.findViewById(R.id.tvTaskAssignee)
        val due: TextView = view.findViewById(R.id.tvTaskDue)
        val done: Button = view.findViewById(R.id.btnTaskDone)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_cleaning_task, parent, false)
        return Holder(view)
    }

    override fun onBindViewHolder(holder: Holder, position: Int) {
        val task = tasks[position]
        val context = holder.itemView.context

        holder.area.text = task.areaName
        // 이번 회차만 대신하는 경우에는 원래 담당자도 함께 보여준다. (예: "담당 지우님 · 이번만 대신 (원래 민서님)")
        holder.assignee.text = task.assignee?.nickname?.let { nick ->
            if (task.isSubstitute) {
                "담당 ${nick}님 · 이번만 대신" + (task.baseAssignee?.nickname?.let { " (원래 ${it}님)" } ?: "")
            } else {
                "담당 ${nick}님"
            }
        } ?: "담당자 없음 (누구나 할 수 있어요)"

        // 예정일: "11.28 (토) · D-3". 지난 청소는 빨간색으로 강조한다.
        val date = LocalDate.parse(task.nextDueDate.take(10))
        val days = ChronoUnit.DAYS.between(LocalDate.now(), date)
        val dateText = date.format(DateTimeFormatter.ofPattern("M.d (E)", Locale.KOREAN))
        val dayText = when {
            days < 0 -> "${-days}일 지남"
            days == 0L -> "오늘"
            else -> "D-$days"
        }
        holder.due.text = "$dateText · $dayText" + if (task.isPostponed) " · 미룸" else ""
        holder.due.setTextColor(
            ContextCompat.getColor(
                context,
                when {
                    days < 0 -> R.color.rm_danger
                    days == 0L -> R.color.rm_primary
                    else -> R.color.rm_sub
                }
            )
        )
        holder.due.setTypeface(null, if (days <= 0) android.graphics.Typeface.BOLD else android.graphics.Typeface.NORMAL)

        // 완료는 담당자만 할 수 있어서, 담당자가 아니면 버튼을 숨긴다. (담당자가 없는 청소는 누구나 가능)
        holder.done.visibility = if (canDone(task)) View.VISIBLE else View.GONE
        holder.done.setOnClickListener { onDone(task) }
        holder.itemView.setOnClickListener { onOpen(task) }
    }

    override fun getItemCount() = tasks.size

    fun submit(newTasks: List<CleaningTask>) {
        tasks.clear()
        tasks.addAll(newTasks)
        notifyDataSetChanged()
    }
}
