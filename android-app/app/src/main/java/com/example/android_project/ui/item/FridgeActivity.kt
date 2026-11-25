package com.example.android_project.ui.item

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.example.android_project.R
import com.example.android_project.data.ItemRepository
import kotlinx.coroutines.launch

/**
 * 냉장고: 모든 음식(식재료)을 여기서 본다.
 *  - 내 음식: 내가 등록한 개인 음식
 *  - 공용 음식: 방 구성원 모두가 쓰는 음식
 *  - 구성원 음식: 다른 구성원이 등록한 개인 음식 (읽기 전용)
 */
class FridgeActivity : com.example.android_project.ui.BaseActivity() {

    private enum class Tab { MINE, SHARED, OTHERS }

    private lateinit var repo: ItemRepository
    private lateinit var adapter: ItemAdapter

    private lateinit var tabMine: TextView
    private lateinit var tabShared: TextView
    private lateinit var tabOthers: TextView
    private lateinit var tvBannerTitle: TextView
    private lateinit var tvBannerSub: TextView
    private lateinit var tvListTitle: TextView
    private lateinit var tvEmpty: TextView
    private lateinit var btnAdd: Button
    private lateinit var tvAddHint: TextView

    private var roomId = 0
    private var stock: Stock? = null
    private var tab = Tab.MINE

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_fridge)

        roomId = intent.getIntExtra("roomId", 0)
        repo = ItemRepository(this)

        tabMine = findViewById(R.id.tabMine)
        tabShared = findViewById(R.id.tabShared)
        tabOthers = findViewById(R.id.tabOthers)
        tvBannerTitle = findViewById(R.id.tvBannerTitle)
        tvBannerSub = findViewById(R.id.tvBannerSub)
        tvListTitle = findViewById(R.id.tvListTitle)
        tvEmpty = findViewById(R.id.tvFridgeEmpty)
        btnAdd = findViewById(R.id.btnAddFood)
        tvAddHint = findViewById(R.id.tvAddHint)

        val roomName = intent.getStringExtra("roomName").orEmpty()
        findViewById<TextView>(R.id.tvFridgeRoom).text = "$roomName · 함께 쓰는 냉장고"

        findViewById<ImageView>(R.id.ivBack).setOnClickListener { finish() }

        tabMine.setOnClickListener { tab = Tab.MINE; render() }
        tabShared.setOnClickListener { tab = Tab.SHARED; render() }
        tabOthers.setOnClickListener { tab = Tab.OTHERS; render() }

        adapter = ItemAdapter { item ->
            // 다른 구성원의 개인 음식은 볼 수만 있다.
            if (stock?.isEditable(item) == false) ItemActions.showReadOnly(this, item)
            else ItemActions.show(this, repo, roomId, item) { load() }
        }
        findViewById<RecyclerView>(R.id.rvFridge).apply {
            this.adapter = this@FridgeActivity.adapter
            layoutManager = LinearLayoutManager(this@FridgeActivity)
        }

        btnAdd.setOnClickListener {
            startActivity(
                Intent(this, ItemFormActivity::class.java)
                    .putExtra(ItemFormActivity.EXTRA_ROOM_ID, roomId)
                    .putExtra(ItemFormActivity.EXTRA_OWNERSHIP, if (tab == Tab.SHARED) "SHARED" else "PERSONAL")
                    .putExtra(ItemFormActivity.EXTRA_CATEGORY, "FOOD")
            )
        }

        render()
    }

    override fun onResume() {
        super.onResume()
        load()
    }

    private fun load() {
        lifecycleScope.launch {
            try {
                val (loaded, error) = StockLoader.load(repo, roomId)
                if (loaded == null) {
                    com.example.android_project.util.Msg.makeText(this@FridgeActivity, error, Toast.LENGTH_LONG).show()
                    return@launch
                }
                stock = loaded
                render()
            } catch (e: Exception) {
                com.example.android_project.util.Msg.makeText(
                    this@FridgeActivity,
                    "서버에 연결할 수 없습니다.\n(${e.message})",
                    Toast.LENGTH_LONG
                ).show()
            }
        }
    }

    private fun render() {
        val data = stock
        val mine = data?.myFood.orEmpty()
        val shared = data?.sharedFood.orEmpty()
        val others = data?.othersFood.orEmpty()

        tabMine.text = "내 음식 ${mine.size}"
        tabShared.text = "공용 음식 ${shared.size}"
        tabOthers.text = "구성원 음식 ${others.size}"
        styleSegment(tabMine, tab == Tab.MINE)
        styleSegment(tabShared, tab == Tab.SHARED)
        styleSegment(tabOthers, tab == Tab.OTHERS)

        val shown = when (tab) {
            Tab.SHARED -> {
                tvBannerTitle.text = "우리 모두의 음식"
                tvBannerSub.text = "방 구성원 누구나 먹어도 괜찮아요."
                tvListTitle.text = "공용 음식 ${shared.size}개"
                btnAdd.visibility = View.VISIBLE
                btnAdd.text = "+  음식 추가"
                tvAddHint.text = "공용 음식은 우리 방 구성원 모두가 사용할 수 있어요."
                shared
            }
            Tab.OTHERS -> {
                tvBannerTitle.text = "구성원의 음식"
                tvBannerSub.text = "다른 구성원이 등록한 개인 음식이에요. 볼 수만 있어요."
                tvListTitle.text = "구성원 음식 ${others.size}개"
                // 다른 사람의 개인 음식은 추가·수정할 수 없다.
                btnAdd.visibility = View.GONE
                tvAddHint.text = "구성원의 개인 음식은 등록한 사람만 수정하거나 삭제할 수 있어요."
                others
            }
            Tab.MINE -> {
                tvBannerTitle.text = "나만의 음식"
                tvBannerSub.text = "내 음식이에요. 다른 구성원은 볼 수만 있고 사용하지 않아요."
                tvListTitle.text = "내 음식 ${mine.size}개"
                btnAdd.visibility = View.VISIBLE
                btnAdd.text = "+  음식 추가"
                tvAddHint.text = "음식을 누르면 수량과 유통기한을 수정하거나 공용 음식으로 바꿀 수 있어요."
                mine
            }
        }

        adapter.submit(shown)
        tvEmpty.text = when (tab) {
            Tab.OTHERS -> "다른 구성원이 등록한 개인 음식이 없어요."
            else -> "아직 등록한 음식이 없어요."
        }
        tvEmpty.visibility = if (shown.isEmpty()) View.VISIBLE else View.GONE
    }

    private fun styleSegment(tab: TextView, on: Boolean) {
        if (on) {
            tab.setBackgroundResource(R.drawable.bg_card_white_plain)
            tab.setTextColor(ContextCompat.getColor(this, R.color.rm_primary))
        } else {
            tab.background = null
            tab.setTextColor(ContextCompat.getColor(this, R.color.rm_sub))
        }
    }
}
