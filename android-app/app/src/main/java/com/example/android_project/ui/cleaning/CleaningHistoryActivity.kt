package com.example.android_project.ui.cleaning

import android.content.res.ColorStateList
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.example.android_project.R
import com.example.android_project.data.ScheduleRepository
import com.example.android_project.model.CleaningEvent
import com.example.android_project.util.ApiError
import com.google.gson.Gson
import kotlinx.coroutines.launch

/** 청소 이력: 방 전체의 완료·건너뜀·미룸·담당자 변경을 청소 예정일이 최근인 순서로 보여준다. */
class CleaningHistoryActivity : com.example.android_project.ui.BaseActivity() {

    companion object {
        const val EXTRA_ROOM_ID = "roomId"
        const val EXTRA_ROOM_NAME = "roomName"
    }

    private lateinit var repo: ScheduleRepository
    private lateinit var adapter: EventAdapter
    private lateinit var tvEmpty: TextView

    private var roomId = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_cleaning_history)

        roomId = intent.getIntExtra(EXTRA_ROOM_ID, 0)
        repo = ScheduleRepository(this)

        findViewById<TextView>(R.id.tvHistoryRoom).text =
            "${intent.getStringExtra(EXTRA_ROOM_NAME).orEmpty()} · 우리 방 청소 기록"
        tvEmpty = findViewById(R.id.tvHistoryEmpty)
        findViewById<ImageView>(R.id.ivBack).setOnClickListener { finish() }

        adapter = EventAdapter()
        findViewById<RecyclerView>(R.id.rvHistory).apply {
            this.adapter = this@CleaningHistoryActivity.adapter
            layoutManager = LinearLayoutManager(this@CleaningHistoryActivity)
        }

        load()
    }

    private fun load() {
        lifecycleScope.launch {
            try {
                val response = repo.listCleaningHistory(roomId, null, 100)

                when {
                    response == null -> toast("로그인이 필요합니다.")
                    response.isSuccessful -> {
                        val array = response.body()?.getAsJsonArray("events")
                        val events =
                            if (array == null) emptyList()
                            else Gson().fromJson(array, Array<CleaningEvent>::class.java).toList()

                        adapter.submit(events)
                        tvEmpty.visibility = if (events.isEmpty()) View.VISIBLE else View.GONE
                    }
                    else -> toast(ApiError.messageOf(response, "청소 이력을 불러오지 못했어요."))
                }
            } catch (e: Exception) {
                toast("서버에 연결할 수 없습니다.\n(${e.message})")
            }
        }
    }

    private fun toast(message: String) {
        com.example.android_project.util.Msg.makeText(this, message, Toast.LENGTH_LONG).show()
    }

    // 이력 한 줄 목록
    private class EventAdapter : RecyclerView.Adapter<EventAdapter.Holder>() {

        private val events = mutableListOf<CleaningEvent>()

        class Holder(view: View) : RecyclerView.ViewHolder(view) {
            val bar: View = view.findViewById(R.id.viewEventBar)
            val title: TextView = view.findViewById(R.id.tvEventTitle)
            val date: TextView = view.findViewById(R.id.tvEventDate)
            val detail: TextView = view.findViewById(R.id.tvEventDetail)
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder =
            Holder(LayoutInflater.from(parent.context).inflate(R.layout.item_cleaning_event, parent, false))

        override fun onBindViewHolder(holder: Holder, position: Int) {
            val e = events[position]
            val context = holder.itemView.context

            // 종류마다 막대 색이 다르다: 완료=초록, 미룸=노랑, 담당자 변경=진한 갈색, 건너뜀=주황
            val color = ContextCompat.getColor(
                context,
                when (e.type) {
                    "DONE" -> R.color.rm_kind_cleaning
                    "POSTPONED" -> R.color.rm_kind_expiry
                    "REASSIGNED" -> R.color.rm_title
                    else -> R.color.rm_primary
                }
            )
            holder.bar.backgroundTintList = ColorStateList.valueOf(color)

            holder.title.text = "${e.areaName} · ${CleaningEventText.title(e)}"
            holder.date.text = "예정일 ${CleaningEventText.date(e.dueDate)}"

            val detail = CleaningEventText.detail(e)
            holder.detail.text = detail
            holder.detail.visibility = if (detail.isEmpty()) View.GONE else View.VISIBLE
        }

        override fun getItemCount() = events.size

        fun submit(newEvents: List<CleaningEvent>) {
            events.clear()
            events.addAll(newEvents)
            notifyDataSetChanged()
        }
    }
}
