require('dotenv').config();
const express=require('express');
const {Pool}=require('pg');
const helmet=require('helmet');
const rateLimit=require('express-rate-limit');
const path=require('path');
const fs=require('fs');
const {isValidCode,isValidUrl}=require('./utils/validator');
const {customAlphabet}=require('nanoid');

const app=express();
const pool=new Pool({connectionString:process.env.DATABASE_URL});
const nano=customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',6);

app.use(helmet({contentSecurityPolicy:{useDefaults:true, directives:{'script-src-attr':["'unsafe-inline'"]}}}));
app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use('/',express.static(path.join(__dirname,'public')));

const createLimiter = rateLimit({windowMs:60*1000, max:10});

app.post('/api/links', createLimiter, async(req,res)=>{
  let {longUrl,code}=req.body;
  if(!isValidUrl(longUrl)) return res.status(400).json({error:'Invalid URL'});
  let final=code && code.trim()? code.trim(): nano();
  if(!isValidCode(final)) return res.status(400).json({error:'Bad code'});
  try{
    const exists=await pool.query("SELECT 1 FROM links WHERE code=$1",[final]);
    if(exists.rowCount>0) return res.status(409).json({error:'Exists'});
    const ins=await pool.query(
      "INSERT INTO links(code,long_url) VALUES($1,$2) RETURNING *",
      [final,longUrl]
    );
    const r=ins.rows[0];
    const baseUrl= req.protocol+"://"+req.headers.host;
    res.status(201).json({
      code:r.code,
      longUrl:r.long_url,
      clicks:r.clicks,
      lastClicked:r.last_clicked,
      createdAt:r.created_at,
      shortUrl: baseUrl+"/"+r.code
    });
  }catch(e){res.status(500).json({error:'Error'});}
});

app.get('/api/links', async(req,res)=>{
  const q=await pool.query("SELECT * FROM links ORDER BY created_at DESC");
  const baseUrl= req.protocol+"://"+req.headers.host;
  res.json(q.rows.map(r=>({...r,longUrl:r.long_url, shortUrl:baseUrl+'/'+r.code})));
});

app.get('/api/links/:code', async(req,res)=>{
  const c=req.params.code;
  if(!isValidCode(c)) return res.status(400).json({error:'Bad code'});
  const q=await pool.query("SELECT * FROM links WHERE code=$1",[c]);
  if(!q.rowCount) return res.status(404).json({error:'Not found'});
  const r=q.rows[0];
  const baseUrl= req.protocol+"://"+req.headers.host;
  res.json({...r,longUrl:r.long_url, shortUrl:baseUrl+'/'+r.code});
});

app.delete('/api/links/:code', async(req,res)=>{
  const c=(req.params.code || '').trim();
  if(!c) return res.status(400).json({error:'Invalid code parameter'});
  // Allow deletion even if code doesn't match strict validator pattern
  // (in case codes were created with different rules)
  try{
    const d=await pool.query("DELETE FROM links WHERE code=$1",[c]);
    if(!d.rowCount) return res.status(404).json({error:'Not found'});
    res.json({ok:true});
  }catch(e){
    console.error('Delete error:', e);
    res.status(500).json({error:'Error deleting link'});
  }
});

app.get('/', (req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));

app.get('/code/:code', async(req,res)=>{
  const c=req.params.code;
  if(!c || typeof c !== 'string') return res.status(400).send('Invalid code');
  try{
    const q=await pool.query("SELECT * FROM links WHERE code=$1",[c]);
    if(!q.rowCount) return res.status(404).send('Link not found');
    const r=q.rows[0];
    const baseUrl= req.protocol+"://"+req.headers.host;
    
    // Read and render the template
    const templatePath=path.join(__dirname,'public','code.html');
    let html=fs.readFileSync(templatePath,'utf8');
    
    // Replace placeholders with actual values
    html=html.replace(/\{\{code\}\}/g, r.code || '');
    html=html.replace(/\{\{shortUrl\}\}/g, baseUrl+'/'+r.code);
    html=html.replace(/\{\{longUrl\}\}/g, r.long_url || '');
    html=html.replace(/\{\{clicks\}\}/g, r.clicks || 0);
    html=html.replace(/\{\{createdAt\}\}/g, r.created_at ? new Date(r.created_at).toLocaleString() : '');
    
    res.send(html);
  }catch(e){
    console.error('Stats error:', e);
    res.status(500).send('Error loading stats');
  }
});

app.get('/:code', async(req,res)=>{
  const c=req.params.code;
  if(!isValidCode(c)) return res.status(404).send('Not found');
  const q=await pool.query("SELECT long_url FROM links WHERE code=$1",[c]);
  if(!q.rowCount) return res.status(404).send('Not found');
  await pool.query("UPDATE links SET clicks=clicks+1,last_clicked=NOW() WHERE code=$1",[c]);
  res.redirect(302,q.rows[0].long_url);
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Server running on port", port));

