package com.example.android_project.ui.calendar

import android.content.res.ColorStateList
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.RecyclerView
import com.example.android_project.R

class ScheduleAdapter(
    private val onClick: (CalendarEntry) -> Unit
) : RecyclerView.Adapter<ScheduleAdapter.Holder>() {

    private val items = mutableListOf<CalendarEntry>()

    class Holder(view: View) : RecyclerView.ViewHolder(view) {
        val bar: View = view.findViewById(R.id.viewScheduleBar)
        val start: TextView = view.findViewById(R.id.tvScheduleStart)
        val end: TextView = view.findViewById(R.id.tvScheduleEnd)
        val title: TextView = view.findViewById(R.id.tvScheduleTitle)
        val meta: TextView = view.findViewById(R.id.tvScheduleMeta)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_schedule, parent, false)
        return Holder(view)
    }

    override fun onBindViewHolder(holder: Holder, position: Int) {
        val entry = items[position]
        val color = ContextCompat.getColor(holder.itemView.context, entry.kind.colorRes)

        // 종류마다 막대와 왼쪽 글씨 색이 다르다.
        holder.bar.backgroundTintList = ColorStateList.valueOf(color)
        holder.start.setTextColor(color)
        holder.start.textSize = if (entry.isAllDay) 16f else 20f

        holder.start.text = entry.timeLabel
        holder.end.text = entry.subLabel
        holder.title.text = entry.title
        holder.meta.text = entry.meta

        holder.itemView.setOnClickListener { onClick(entry) }
    }

    override fun getItemCount() = items.size

    fun submit(newItems: List<CalendarEntry>) {
        items.clear()
        items.addAll(newItems)
        notifyDataSetChanged()
    }
}
