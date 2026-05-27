require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 8080;
const BASE_URL = process.env.SUNOR_API_BASE_URL;
const API_KEY = process.env.SUNOR_API_KEY;

app.use(cors());
app.use(express.json());

const headers = {
  'x-api-key': API_KEY,
  'Content-Type': 'application/json'
};

// 음악 생성 요청 엔드포인트
app.post('/api/generate', async (req, res) => {
  const { prompt } = req.body;
  try {
    const url = `${BASE_URL}/task`;
    console.log(`[생성 요청 주소]: ${url}`);
    
    const payload = {
      model: "suno",
      task_type: "music",
      input: {
        gpt_description_prompt: prompt,
        make_instrumental: true
      }
    };

    const response = await axios.post(url, payload, { headers });
    console.log("[생성 응답]:", JSON.stringify(response.data, null, 2));

    const jobId = response.data.data?.task_id;
    if (!jobId) throw new Error("작업 ID를 찾을 수 없습니다.");
    
    res.json({ jobId: jobId });

  } catch (error) {
    console.error("생성 에러:", error.response?.data || error.message);
    res.status(500).json({ error: "생성 요청 실패" });
  }
});

// 상태 확인 엔드포인트
app.get('/api/status', async (req, res) => {
  const { id } = req.query;
  try {
    const url = `${BASE_URL}/task/${id}`; 
    const response = await axios.get(url, { headers });
    
    // JSON 구조가 어떻게 바뀌든 깊숙한 곳의 url을 싹 다 긁어옵니다.
    let finalAudioUrl = null;
    let finalImageUrl = null;
    
    function extractUrls(obj) {
      if (!obj || typeof obj !== 'object') return;
      if (!finalAudioUrl && obj.audio_url) finalAudioUrl = obj.audio_url;
      if (!finalImageUrl && obj.image_url) finalImageUrl = obj.image_url;
      
      Object.values(obj).forEach(val => extractUrls(val));
    }
    
    extractUrls(response.data);

    const data = response.data.data || response.data;
    const status = data.status || 'pending';

    // URL을 하나라도 찾았거나 상태가 완료라면 성공 처리
    if (status === 'completed' || status === 'success' || finalAudioUrl) {
      res.json({ 
        status: "completed", 
        audioUrl: finalAudioUrl,
        imageUrl: finalImageUrl 
      });
    } else if (status === 'failed' || status === 'error') {
      res.status(500).json({ error: "음악 생성 실패" });
    } else {
      res.json({ status: status });
    }
  } catch (error) {
    console.error("상태 에러:", error.message);
    res.status(500).json({ error: "상태 확인 실패" });
  }
});

app.get('/api/stream', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send("URL이 없습니다.");

  try {
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream' // 파일을 다운받지 않고 실시간 스트림으로 연결
    });
    
    // 브라우저가 음악 파일로 찰떡같이 인식하도록 헤더 세팅
    res.setHeader('Content-Type', response.headers['content-type'] || 'audio/mpeg');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    // Suno 서버에서 오는 음악 데이터를 프론트엔드로 바로 연결(Pipe)
    response.data.pipe(res);
  } catch (error) {
    console.error("오디오 프록시 에러:", error.message);
    res.status(500).send("오디오를 불러오지 못했습니다.");
  }
});

app.listen(PORT, () => {
  console.log(`RHYTHMIX 서버 실행 중 (포트 ${PORT} - Sunor 서버 통신 완료)`);
});