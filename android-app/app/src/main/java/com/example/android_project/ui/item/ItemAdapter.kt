package com.example.android_project.ui.item

import android.graphics.Typeface
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.RecyclerView
import com.example.android_project.R
import com.example.android_project.model.Item

class ItemAdapter(
    private val onClick: (Item) -> Unit
) : RecyclerView.Adapter<ItemAdapter.Holder>() {

    private val items = mutableListOf<Item>()

    class Holder(view: View) : RecyclerView.ViewHolder(view) {
        val name: TextView = view.findViewById(R.id.tvItemName)
        val meta: TextView = view.findViewById(R.id.tvItemMeta)
        val quantity: TextView = view.findViewById(R.id.tvItemQuantity)
        val expiry: TextView = view.findViewById(R.id.tvItemExpiry)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_stock, parent, false)
        return Holder(view)
    }

    override fun onBindViewHolder(holder: Holder, position: Int) {
        val item = items[position]

        holder.name.text = item.name
        holder.quantity.text = item.quantityText()

        val parts = mutableListOf<String>()
        parts.add(if (item.ownershipType == "SHARED") "공용" else "개인")
        item.ownerNickname?.let { parts.add("${it}님이 등록") }
        item.storageLocation?.takeIf { it.isNotBlank() }?.let { parts.add(it) }
        holder.meta.text = parts.joinToString(" · ")

        // 유통기한: "11.09까지 · D-2 · 먼저 먹어요" (3일 이내는 강조)
        val days = item.daysUntilExpiry
        val date = item.expiryDate
        if (date != null && days != null) {
            val dayText = when {
                days < 0 -> "${-days}일 지남"
                days == 0 -> "D-DAY"
                else -> "D-$days"
            }
            val urgent = days <= 3
            val monthDay = date.take(10).split("-").let {
                if (it.size == 3) "${it[1]}.${it[2]}" else date
            }

            holder.expiry.visibility = View.VISIBLE
            holder.expiry.text = "${monthDay}까지 · $dayText" + if (urgent) " · 먼저 먹어요" else ""
            holder.expiry.setTextColor(
                ContextCompat.getColor(
                    holder.itemView.context,
                    if (urgent) R.color.rm_primary else R.color.rm_sub
                )
            )
            holder.expiry.setTypeface(null, if (urgent) Typeface.BOLD else Typeface.NORMAL)
        } else {
            holder.expiry.visibility = View.GONE
        }

        holder.itemView.setOnClickListener { onClick(item) }
    }

    override fun getItemCount() = items.size

    fun submit(newItems: List<Item>) {
        items.clear()
        items.addAll(newItems)
        notifyDataSetChanged()
    }
}
