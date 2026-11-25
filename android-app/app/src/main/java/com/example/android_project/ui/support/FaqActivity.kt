package com.example.android_project.ui.support

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import com.example.android_project.R
import com.example.android_project.ui.BaseActivity

/**
 * 자주 묻는 질문. 내용은 assets/faq.txt 에서 읽는다. 직접 고칠 때는 아래 형식을 지킨다.
 *   "## 분류"  → 분류 제목
 *   "Q. 질문"  → 질문 (누르면 답이 펼쳐진다)
 *   "A. 답변"  → 답변 (이어지는 줄도 답변에 포함된다)
 */
class FaqActivity : BaseActivity() {

    private class Item(val question: String, val answer: String)
    private class Section(val title: String, val items: MutableList<Item> = mutableListOf())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_faq)
        findViewById<View>(R.id.ivBack).setOnClickListener { finish() }

        val sections = try {
            parse(assets.open("faq.txt").bufferedReader(Charsets.UTF_8).use { it.readText() })
        } catch (e: Exception) {
            emptyList()
        }

        val container = findViewById<ViewGroup>(R.id.layoutFaq)
        if (sections.isEmpty()) {
            findViewById<View>(R.id.tvFaqEmpty).visibility = View.VISIBLE
            return
        }
        val dp = resources.displayMetrics.density
        for (section in sections) {
            container.addView(TextView(this).apply {
                text = section.title
                setTextColor(getColor(R.color.rm_title))
                textSize = 18f
                setTypeface(null, android.graphics.Typeface.BOLD)
                setPadding(0, ((if (container.childCount == 0) 4 else 20) * dp).toInt(), 0, (10 * dp).toInt())
            })
            for (item in section.items) container.addView(row(item, container))
        }
    }

    private fun row(item: Item, parent: ViewGroup): View {
        val view = LayoutInflater.from(this).inflate(R.layout.item_faq, parent, false)
        val answer = view.findViewById<TextView>(R.id.tvFaqAnswer)
        val chevron = view.findViewById<ImageView>(R.id.ivFaqChevron)
        view.findViewById<TextView>(R.id.tvFaqQuestion).text = item.question
        answer.text = item.answer
        view.findViewById<View>(R.id.rowFaqQuestion).setOnClickListener {
            val open = answer.visibility != View.VISIBLE
            answer.visibility = if (open) View.VISIBLE else View.GONE
            chevron.rotation = if (open) 180f else 0f
        }
        return view
    }

    private fun parse(raw: String): List<Section> {
        val sections = mutableListOf<Section>()
        var question: String? = null
        val answer = StringBuilder()

        fun flush() {
            val q = question ?: return
            if (sections.isEmpty()) sections.add(Section("자주 묻는 질문"))
            sections.last().items.add(Item(q, answer.toString().trim()))
            question = null
            answer.clear()
        }

        for (line in raw.removePrefix("\uFEFF").replace("\r\n", "\n").lines()) {
            when {
                line.startsWith("## ") -> { flush(); sections.add(Section(line.removePrefix("## ").trim())) }
                line.startsWith("Q. ") -> { flush(); question = line.removePrefix("Q. ").trim() }
                line.startsWith("A. ") && question != null -> answer.append(line.removePrefix("A. ").trim())
                question != null && line.isNotBlank() -> answer.append("\n").append(line.trim())
            }
        }
        flush()
        return sections.filter { it.items.isNotEmpty() }
    }
}