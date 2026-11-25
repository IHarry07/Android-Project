package com.example.android_project.ui.search

import android.content.Intent
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.widget.EditText
import android.widget.ImageView
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import com.example.android_project.R
import com.example.android_project.data.RetrofitClient
import com.example.android_project.model.SearchCounts
import com.example.android_project.model.SearchResult
import com.example.android_project.ui.item.FridgeActivity
import com.example.android_project.ui.main.MainTabsActivity
import com.example.android_project.ui.notification.NotificationBell
import com.example.android_project.util.ApiError
import com.example.android_project.util.Msg
import com.example.android_project.util.TokenManager
import com.google.gson.Gson
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** 검색 탭: 우리 방의 음식·물품·일정(청소 포함)을 이름, 보관 장소, 담당자로 찾는다. */
class SearchFragment : Fragment() {

    private enum class Filter { ALL, FOOD, SUPPLY, SCHEDULE }

    private lateinit var bell: NotificationBell
    private lateinit var etSearch: EditText
    private lateinit var ivClear: View
    private lateinit var scrollChips: View
    private lateinit var chips: Map<Filter, TextView>
    private lateinit var layoutHeader: View
    private lateinit var tvHeader: TextView
    private lateinit var tvCount: TextView
    private lateinit var tvEmpty: TextView
    private lateinit var layoutResults: ViewGroup
    private lateinit var tvFootnote: View

    private var filter = Filter.ALL
    private var query = ""
    private var counts = SearchCounts()
    private var results: List<SearchResult> = emptyList()
    private var job: Job? = null
    private val gson = Gson()

    private val roomId: Int?
        get() = (activity as? MainTabsActivity)?.currentRoom?.roomId

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View =
        inflater.inflate(R.layout.fragment_search, container, false)

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        bell = NotificationBell(this, view.findViewById(R.id.bell))
        etSearch = view.findViewById(R.id.etSearch)
        ivClear = view.findViewById(R.id.ivClear)
        scrollChips = view.findViewById(R.id.scrollChips)
        layoutHeader = view.findViewById(R.id.layoutResultHeader)
        tvHeader = view.findViewById(R.id.tvResultHeader)
        tvCount = view.findViewById(R.id.tvResultCount)
        tvEmpty = view.findViewById(R.id.tvSearchEmpty)
        layoutResults = view.findViewById(R.id.layoutResults)
        tvFootnote = view.findViewById(R.id.tvResultFootnote)
        chips = mapOf(
            Filter.ALL to view.findViewById(R.id.chipAll),
            Filter.FOOD to view.findViewById(R.id.chipFood),
            Filter.SUPPLY to view.findViewById(R.id.chipSupply),
            Filter.SCHEDULE to view.findViewById(R.id.chipSchedule)
        )
        chips.forEach { (f, chip) -> chip.setOnClickListener { filter = f; render() } }

        ivClear.setOnClickListener { etSearch.setText("") }
        etSearch.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                ivClear.visibility = if (s.isNullOrEmpty()) View.GONE else View.VISIBLE
                // 입력을 멈추고 잠깐 뒤에 검색한다.
                schedule(s?.toString().orEmpty().trim(), 300)
            }
        })
        etSearch.setOnEditorActionListener { _, action, _ ->
            if (action == EditorInfo.IME_ACTION_SEARCH) schedule(etSearch.text.toString().trim(), 0)
            action == EditorInfo.IME_ACTION_SEARCH
        }
        render()
    }

    override fun onResume() {
        super.onResume()
        bell.refresh()
    }

    private fun schedule(text: String, waitMs: Long) {
        job?.cancel()
        query = text
        if (text.isEmpty()) {
            results = emptyList()
            counts = SearchCounts()
            render()
            return
        }
        job = viewLifecycleOwner.lifecycleScope.launch {
            delay(waitMs)
            fetch(text)
        }
    }

    private suspend fun fetch(text: String) {
        val id = roomId ?: return
        val token = TokenManager(requireContext()).getToken()?.let { "Bearer $it" } ?: return
        try {
            val response = RetrofitClient.searchApiService.search(token, id, text)
            if (text != query) return // 그 사이에 검색어가 바뀌었다.
            if (response.isSuccessful) {
                val body = response.body() ?: return
                counts = gson.fromJson(body.getAsJsonObject("counts"), SearchCounts::class.java)
                results = body.getAsJsonArray("results").map { gson.fromJson(it, SearchResult::class.java) }
                render()
            } else {
                Msg.show(requireContext(), ApiError.messageOf(response, "검색하지 못했어요."))
            }
        } catch (e: Exception) {
            if (isAdded) Msg.show(requireContext(), "서버에 연결할 수 없어요.")
        }
    }

    private fun matches(r: SearchResult) = when (filter) {
        Filter.ALL -> true
        Filter.FOOD -> r.type == "FOOD"
        Filter.SUPPLY -> r.type == "SUPPLY"
        Filter.SCHEDULE -> r.type == "SCHEDULE" || r.type == "CLEANING"
    }

    private fun render() {
        val hasQuery = query.isNotEmpty()
        scrollChips.visibility = if (hasQuery) View.VISIBLE else View.GONE
        layoutHeader.visibility = if (hasQuery) View.VISIBLE else View.GONE
        layoutResults.removeAllViews()

        chips[Filter.ALL]?.text = "전체 ${counts.all}"
        chips[Filter.FOOD]?.text = "음식 ${counts.food}"
        chips[Filter.SUPPLY]?.text = "물품 ${counts.supply}"
        chips[Filter.SCHEDULE]?.text = "일정 ${counts.schedule}"
        chips.forEach { (f, chip) ->
            val on = f == filter
            chip.setBackgroundResource(if (on) R.drawable.bg_chip_on else R.drawable.bg_chip_off)
            chip.setTextColor(requireContext().getColor(if (on) R.color.white else R.color.rm_sub))
        }

        val shown = results.filter { matches(it) }
        tvHeader.text = "‘$query’ 검색 결과"
        tvCount.text = "${shown.size}개"
        tvEmpty.visibility = if (hasQuery && shown.isEmpty()) View.VISIBLE else View.GONE
        tvEmpty.text = "찾는 결과가 없어요.\n다른 검색어로 찾아보세요."
        tvFootnote.visibility = if (shown.any { it.type == "FOOD" || it.type == "SUPPLY" }) View.VISIBLE else View.GONE

        for (r in shown) {
            val row = LayoutInflater.from(requireContext()).inflate(R.layout.item_search_result, layoutResults, false)
            row.findViewById<ImageView>(R.id.ivResultIcon).setImageResource(
                when (r.type) {
                    "FOOD" -> R.drawable.ic_food
                    "SUPPLY" -> R.drawable.ic_archive
                    else -> R.drawable.ic_calendar
                }
            )
            row.findViewById<TextView>(R.id.tvResultType).text = r.typeLabel()
            row.findViewById<TextView>(R.id.tvResultTitle).text = r.title
            row.findViewById<TextView>(R.id.tvResultLine1).apply {
                text = r.line1.orEmpty()
                visibility = if (r.line1.isNullOrEmpty()) View.GONE else View.VISIBLE
            }
            row.findViewById<TextView>(R.id.tvResultLine2).apply {
                text = r.line2.orEmpty()
                visibility = if (r.line2.isNullOrEmpty()) View.GONE else View.VISIBLE
            }
            row.setOnClickListener { open(r) }
            layoutResults.addView(row)
        }
    }

    // 결과를 누르면 그 항목이 있는 화면으로 간다.
    private fun open(r: SearchResult) {
        val main = activity as? MainTabsActivity ?: return
        when (r.type) {
            "FOOD" -> {
                val room = main.currentRoom ?: return
                startActivity(
                    Intent(requireContext(), FridgeActivity::class.java)
                        .putExtra("roomId", room.roomId)
                        .putExtra("roomName", room.roomName)
                )
            }
            "SUPPLY" -> main.openTab(MainTabsActivity.TAB_WAREHOUSE)
            else -> main.openTab(MainTabsActivity.TAB_CALENDAR)
        }
    }
}