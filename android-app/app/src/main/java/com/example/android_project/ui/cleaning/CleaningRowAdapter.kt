package com.example.android_project.ui.cleaning

import android.annotation.SuppressLint
import android.text.Editable
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.example.android_project.R

// 화면에서 편집 중인 한 줄 (구성원 + 담당 구역 + 담당 요일). userId가 -1이면 아직 담당자를 고르지 않은 줄.
data class CleaningRowState(
    var taskId: Int?,
    var userId: Int,
    var nickname: String,
    var area: String,
    var weekday: Int
)

val WEEKDAY_NAMES = arrayOf("일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일")

class CleaningRowAdapter(
    val rows: MutableList<CleaningRowState>,
    private val myUserId: () -> Int?,
    private val showWeekday: () -> Boolean,
    private val onPickMember: (Int) -> Unit,
    private val onPickWeekday: (Int) -> Unit,
    private val onRemove: (Int) -> Unit,
    private val onStartDrag: (RecyclerView.ViewHolder) -> Unit
) : RecyclerView.Adapter<CleaningRowAdapter.Holder>() {

    class Holder(view: View) : RecyclerView.ViewHolder(view) {
        val number: TextView = view.findViewById(R.id.tvRowNumber)
        val member: TextView = view.findViewById(R.id.tvRowMember)
        val area: EditText = view.findViewById(R.id.etRowArea)
        val weekday: TextView = view.findViewById(R.id.tvRowWeekday)
        val fieldWeekday: View = view.findViewById(R.id.fieldWeekday)
        val remove: ImageView = view.findViewById(R.id.ivRowRemove)
        val drag: ImageView = view.findViewById(R.id.ivRowDrag)
        var watcher: TextWatcher? = null
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_cleaning_row, parent, false)
        return Holder(view)
    }

    @SuppressLint("ClickableViewAccessibility")
    override fun onBindViewHolder(holder: Holder, position: Int) {
        val row = rows[position]

        holder.number.text = (position + 1).toString()
        holder.member.text = memberLabel(row)
        holder.weekday.text = WEEKDAY_NAMES[row.weekday]
        // 매일 반복이면 요일이 의미 없어서 숨긴다.
        holder.fieldWeekday.visibility = if (showWeekday()) View.VISIBLE else View.GONE

        // 다시 쓰이는 칸에 이전 줄의 글자 감시가 남지 않게 먼저 떼고, 글자를 넣은 뒤 다시 단다.
        holder.watcher?.let { holder.area.removeTextChangedListener(it) }
        holder.area.setText(row.area)
        val watcher = object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                val index = holder.bindingAdapterPosition
                if (index != RecyclerView.NO_POSITION) rows[index].area = s?.toString().orEmpty()
            }
        }
        holder.area.addTextChangedListener(watcher)
        holder.watcher = watcher

        holder.member.setOnClickListener {
            val index = holder.bindingAdapterPosition
            if (index != RecyclerView.NO_POSITION) onPickMember(index)
        }
        holder.fieldWeekday.setOnClickListener {
            val index = holder.bindingAdapterPosition
            if (index != RecyclerView.NO_POSITION) onPickWeekday(index)
        }
        holder.remove.setOnClickListener {
            val index = holder.bindingAdapterPosition
            if (index != RecyclerView.NO_POSITION) onRemove(index)
        }

        // 손잡이를 누르면 끌기 시작. 바깥 스크롤이 끌기를 가로채지 않게 막는다.
        holder.drag.setOnTouchListener { v, event ->
            if (event.actionMasked == MotionEvent.ACTION_DOWN) {
                v.parent.requestDisallowInterceptTouchEvent(true)
                onStartDrag(holder)
            }
            false
        }
    }

    private fun memberLabel(row: CleaningRowState): String =
        if (row.userId == -1) "담당자를 골라 주세요"
        else row.nickname + if (row.userId == myUserId()) " (나)" else ""

    override fun getItemCount() = rows.size
}
