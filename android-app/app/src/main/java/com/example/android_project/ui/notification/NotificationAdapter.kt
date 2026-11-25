package com.example.android_project.ui.notification

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.example.android_project.R
import com.example.android_project.model.AppNotification

class NotificationAdapter(
    private val onClick: (AppNotification) -> Unit,
    private val onLongClick: (AppNotification) -> Unit
) : RecyclerView.Adapter<NotificationAdapter.Holder>() {

    private val items = mutableListOf<AppNotification>()

    fun submit(list: List<AppNotification>, append: Boolean) {
        if (!append) items.clear()
        items.addAll(list)
        notifyDataSetChanged()
    }

    fun markRead(id: Int) {
        val i = items.indexOfFirst { it.notificationId == id }
        if (i >= 0) {
            items[i] = items[i].copy(isRead = true)
            notifyItemChanged(i)
        }
    }

    fun remove(id: Int) {
        val i = items.indexOfFirst { it.notificationId == id }
        if (i >= 0) {
            items.removeAt(i)
            notifyItemRemoved(i)
        }
    }

    fun isEmpty() = items.isEmpty()

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_notification, parent, false)
        return Holder(view)
    }

    override fun onBindViewHolder(holder: Holder, position: Int) {
        val n = items[position]
        holder.title.text = n.title
        holder.body.text = n.body
        holder.time.text = n.timeText()
        // 안 읽은 알림은 점과 굵은 제목으로 구분한다.
        holder.dot.visibility = if (n.isRead) View.INVISIBLE else View.VISIBLE
        holder.title.setTypeface(null, if (n.isRead) android.graphics.Typeface.NORMAL else android.graphics.Typeface.BOLD)
        holder.itemView.alpha = if (n.isRead) 0.7f else 1f
        holder.itemView.setOnClickListener { onClick(n) }
        holder.itemView.setOnLongClickListener { onLongClick(n); true }
    }

    override fun getItemCount() = items.size

    class Holder(view: View) : RecyclerView.ViewHolder(view) {
        val title: TextView = view.findViewById(R.id.tvNotiTitle)
        val body: TextView = view.findViewById(R.id.tvNotiBody)
        val time: TextView = view.findViewById(R.id.tvNotiTime)
        val dot: View = view.findViewById(R.id.viewNotiDot)
    }
}
