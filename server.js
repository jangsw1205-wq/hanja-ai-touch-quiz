import express from "express";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = process.env.PORT || 3000;
const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

app.use(express.json({ limit: "200kb" }));
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/distractors", async (req, res) => {
  try {
    if (!client) return res.status(500).json({error:"OPENAI_API_KEY가 설정되지 않았습니다."});
    const {cards, target, direction} = req.body;
    if (!Array.isArray(cards) || cards.length < 4 || !target)
      return res.status(400).json({error:"한자 데이터가 부족합니다."});

    const prompt = `한자 학습 앱의 오답 선택지 생성기다.
아래 카드 중에서만 목표 카드와 헷갈릴 만한 오답 3개를 골라라.
우선순위: 1) 모양이 비슷함 2) 음이 비슷함 3) 훈이 비슷함.
목표 카드는 오답에 넣지 마라. 목록 밖의 한자를 만들지 마라.
문제 방향: ${direction === "toMeaning" ? "한자→음훈" : "음훈→한자"}

목표:
${JSON.stringify(target, null, 2)}

카드 목록:
${JSON.stringify(cards.map(c=>({hanja:c.hanja,meaning:c.meaning})), null, 2)}

JSON만 반환:
{"distractors":[{"hanja":"...","meaning":"..."},{"hanja":"...","meaning":"..."},{"hanja":"...","meaning":"..."}]}`;

    const response = await client.responses.create({
      model: "gpt-5.6-luna",
      input: prompt
    });
    const raw = response.output_text?.trim() || "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return res.status(502).json({error:"AI 응답을 읽지 못했습니다."});
    const data = JSON.parse(match[0]);

    const key = c => `${c.hanja}::${c.meaning}`;
    const allowed = new Map(cards.map(c=>[key(c), c]));
    const targetKey = key(target);
    const checked = (data.distractors || [])
      .map(d=>allowed.get(key(d)))
      .filter(Boolean)
      .filter(d=>key(d)!==targetKey);

    if (new Set(checked.map(key)).size !== 3)
      return res.status(502).json({error:"AI가 유효한 오답 3개를 만들지 못했습니다."});

    res.json({distractors:checked});
  } catch (e) {
    console.error(e);
    res.status(500).json({error:"AI 선택지 생성 중 오류가 발생했습니다."});
  }
});

app.listen(port, ()=>console.log(`http://localhost:${port}`));
