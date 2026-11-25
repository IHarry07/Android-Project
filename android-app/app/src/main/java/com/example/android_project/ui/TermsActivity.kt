package com.example.android_project.ui

import android.os.Bundle
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.AbsoluteSizeSpan
import android.text.style.ForegroundColorSpan
import android.text.style.StyleSpan
import android.graphics.Typeface
import android.widget.ImageView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.example.android_project.R

/**
 * 이용약관 화면. 약관 전문은 assets/terms.txt (E:\Project\룸메이드(RoomMate) 이용약관.txt 와 같은 내용)에서 읽는다.
 * 약관이 바뀌면 그 파일을 새 내용으로 바꾸면 된다.
 *
 * 글 모양은 약관 파일의 표시를 따른다.
 *   "# 제목"   → 큰 제목
 *   "## 조항"  → 조항 제목(굵게)
 *   "**굵게**" → 굵은 글씨 (시행일)
 *   "   - 항목" → 점(•) 목록
 */
class TermsActivity : com.example.android_project.ui.BaseActivity() {

    companion object {
        // 같은 화면으로 개인정보 처리방침도 보여준다. (assets 의 다른 문서 파일과 제목을 넘긴다.)
        const val EXTRA_ASSET = "asset"
        const val EXTRA_TITLE = "title"
        const val PRIVACY_ASSET = "privacy_policy.txt"

        // 회원가입 때 열면 끝까지 읽어야 "모두 읽었어요" 버튼이 켜지고, 누르면 RESULT_OK 를 돌려준다.
        const val EXTRA_REQUIRE_READ = "requireRead"

        fun privacyIntent(context: android.content.Context) =
            android.content.Intent(context, TermsActivity::class.java)
                .putExtra(EXTRA_ASSET, PRIVACY_ASSET)
                .putExtra(EXTRA_TITLE, "개인정보 처리방침")
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_terms)

        findViewById<ImageView>(R.id.ivBack).setOnClickListener { finish() }

        val asset = intent.getStringExtra(EXTRA_ASSET) ?: "terms.txt"
        val title = intent.getStringExtra(EXTRA_TITLE) ?: "이용약관"
        findViewById<TextView>(R.id.tvDocTitle).text = title

        val text = try {
            assets.open(asset).bufferedReader(Charsets.UTF_8).use { it.readText() }
        } catch (e: Exception) {
            null
        }

        findViewById<TextView>(R.id.tvTerms).text = when {
            text != null -> format(text)
            asset == PRIVACY_ASSET -> "개인정보 처리방침은 곧 공개돼요."
            else -> "$title 을 불러오지 못했어요."
        }

        if (intent.getBooleanExtra(EXTRA_REQUIRE_READ, false)) setupRequireRead()
    }

    // 문서를 맨 아래까지 내려야 버튼이 켜진다. (한 화면에 다 들어오는 짧은 문서는 바로 켜진다.)
    private fun setupRequireRead() {
        val scroll = findViewById<android.widget.ScrollView>(R.id.svDoc)
        val button = findViewById<android.widget.Button>(R.id.btnReadDone)
        button.visibility = android.view.View.VISIBLE
        button.isEnabled = false
        button.text = "끝까지 읽으면 동의할 수 있어요"

        fun check() {
            val content = scroll.getChildAt(0) ?: return
            if (content.height > 0 && scroll.scrollY + scroll.height >= content.height - 16) {
                button.isEnabled = true
                button.text = "모두 읽었어요"
            }
        }
        scroll.setOnScrollChangeListener { _, _, _, _, _ -> check() }
        scroll.viewTreeObserver.addOnGlobalLayoutListener { check() }
        button.setOnClickListener {
            setResult(android.app.Activity.RESULT_OK)
            finish()
        }
    }

    private fun sp(value: Float) = (value * resources.displayMetrics.scaledDensity).toInt()

    private fun format(raw: String): CharSequence {
        val title = ContextCompat.getColor(this, R.color.rm_title)
        val builder = SpannableStringBuilder()

        // 파일 맨 앞의 보이지 않는 BOM 문자를 없애고, 줄바꿈을 통일한다.
        for (line in raw.removePrefix("﻿").replace("\r\n", "\n").lines()) {
            val start = builder.length

            when {
                line.startsWith("## ") -> {
                    // 조항 제목: 앞에 여백을 두고 굵게
                    if (builder.isNotEmpty()) builder.append("\n")
                    builder.append(line.removePrefix("## "))
                    builder.setSpan(StyleSpan(Typeface.BOLD), start + 1, builder.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                    builder.setSpan(ForegroundColorSpan(title), start + 1, builder.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                    builder.setSpan(AbsoluteSizeSpan(sp(17f)), start + 1, builder.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                }
                line.startsWith("# ") -> {
                    builder.append(line.removePrefix("# "))
                    builder.setSpan(StyleSpan(Typeface.BOLD), start, builder.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                    builder.setSpan(ForegroundColorSpan(title), start, builder.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                    builder.setSpan(AbsoluteSizeSpan(sp(22f)), start, builder.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                }
                line.startsWith("**") && line.endsWith("**") && line.length > 4 -> {
                    builder.append(line.removePrefix("**").removeSuffix("**"))
                    builder.setSpan(StyleSpan(Typeface.BOLD), start, builder.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                    builder.setSpan(ForegroundColorSpan(title), start, builder.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                }
                line.trimStart().startsWith("- ") -> {
                    // 목록 항목은 점으로 바꾸고 조금 들여쓴다.
                    builder.append("    • ").append(line.trimStart().removePrefix("- "))
                }
                else -> builder.append(line)
            }
            builder.append("\n")
        }
        return builder
    }
}
