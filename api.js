// ==== API DE SUPABASE ====
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== ESTADÍSTICAS GENERALES =====
async function getStats() {
  try {
    // Total jugadores
    const { count: totalJugadores } = await sb
      .from('users_balance')
      .select('*', { count: 'exact', head: true });
    
    // En vivo (últimos 10 min)
    const diezMinAtras = Math.floor(Date.now() / 1000) - 600;
    const { count: enVivo } = await sb
      .from('users_balance')
      .select('*', { count: 'exact', head: true })
      .gt('last_claim', diezMinAtras);
    
    // Total JHOAL circulante
    const { data: balances } = await sb
      .from('users_balance')
      .select('balance, wallet_balance');
    let totalJHOAL = 0;
    (balances || []).forEach(u => {
      totalJHOAL += parseFloat(u.balance || 0);
      totalJHOAL += parseFloat(u.wallet_balance || 0);
    });
    
    // Total quemado
    const { data: burns } = await sb.from('burn_wallet').select('amount');
    const totalQuemado = (burns || []).reduce((s, b) => s + parseFloat(b.amount || 0), 0);
    
    // Pool actual
    const { data: lastRound } = await sb
      .from('prediction_rounds')
      .select('total_pool')
      .order('round_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    const poolActual = lastRound ? parseFloat(lastRound.total_pool || 0) : 0;
    
    return {
      totalJugadores: totalJugadores || 0,
      enVivo: enVivo || 0,
      totalJHOAL: Math.floor(totalJHOAL),
      totalQuemado: Math.floor(totalQuemado),
      poolActual: Math.floor(poolActual)
    };
  } catch (e) {
    console.error('Error getStats:', e);
    return { totalJugadores: 0, enVivo: 0, totalJHOAL: 0, totalQuemado: 0, poolActual: 0 };
  }
}

// ===== HISTORIAL PÚBLICO =====
async function getHistory() {
  try {
    const { data: history } = await sb
      .from('history')
      .select('user_id, type, amount, created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    
    return (history || []).map(h => {
      const userId = String(h.user_id);
      const userIdParcial = userId.length > 7 
        ? userId.substring(0, 4) + '...' + userId.slice(-3) 
        : userId;
      
      let emoji = '📌';
      let descripcion = '';
      
      const types = {
        'faucet': { emoji: '🚰', desc: 'Faucet' },
        'ad_reward': { emoji: '📺', desc: 'Anuncio' },
        'dice_win': { emoji: '🎲', desc: 'Dados (Ganó)' },
        'dice_lose': { emoji: '🎲', desc: 'Dados (Perdió)' },
        'plant_buy': { emoji: '🌱', desc: 'Compró planta' },
        'plant_water': { emoji: '💧', desc: 'Regó planta' },
        'plant_harvest': { emoji: '🌾', desc: 'Cosechó' },
        'plant_refund': { emoji: '💸', desc: 'Reembolso' },
        'deposit': { emoji: '💵', desc: 'Depósito' },
        'deposit_game': { emoji: '🎮', desc: 'Movió al juego' },
        'withdraw': { emoji: '💸', desc: 'Retiro' },
        'prediction_ad': { emoji: '🔮', desc: 'Anuncio predicción' },
        'prediction_win': { emoji: '🏆', desc: 'Ganó predicción' },
        'prediction_bet': { emoji: '🔮', desc: 'Predicción' },
        'referral_reward': { emoji: '🎁', desc: 'Referido' },
        'burn': { emoji: '🔥', desc: 'Quema' }
      };
      
      if (types[h.type]) {
        emoji = types[h.type].emoji;
        descripcion = types[h.type].desc;
      }
      
      return {
        userId: userIdParcial,
        type: h.type,
        emoji: emoji,
        descripcion: descripcion,
        amount: parseFloat(h.amount || 0),
        tiempo: h.created_at
      };
    });
  } catch (e) {
    console.error('Error getHistory:', e);
    return [];
  }
}

// ===== RANKING TOP 10 =====
async function getRanking() {
  try {
    const { data: faucets } = await sb
      .from('history')
      .select('user_id')
      .eq('type', 'faucet');
    
    const conteo = {};
    (faucets || []).forEach(h => {
      const userId = String(h.user_id);
      conteo[userId] = (conteo[userId] || 0) + 1;
    });
    
    return Object.entries(conteo)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([userId, count], index) => ({
        posicion: index + 1,
        userId: userId.substring(0, 4) + '...' + userId.slice(-3),
        faucets: count
      }));
  } catch (e) {
    console.error('Error getRanking:', e);
    return [];
  }
}

// ===== PRECIO JHOAL =====
async function getJhoalPrice() {
  try {
    const res = await fetch('https://jhoal-faucet.onrender.com/price');
    const data = await res.json();
    return data.success ? data.priceUsd : 0;
  } catch (e) {
    console.error('Error getJhoalPrice:', e);
    return 0;
  }
}

// ===== TOQUES =====
async function getToques() {
  try {
    const res = await fetch('https://jhoal-faucet.onrender.com/btc-price');
    const btcData = await res.json();
    
    const { data: currentRound } = await sb
      .from('prediction_rounds')
      .select('*')
      .eq('status', 'open')
      .order('round_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    return {
      poolActual: currentRound ? parseFloat(currentRound.total_pool || 0) : 0,
      rondaActual: currentRound ? currentRound.round_number : 0,
      btcPrice: btcData.success ? btcData.price : 0
    };
  } catch (e) {
    console.error('Error getToques:', e);
    return { poolActual: 0, rondaActual: 0, btcPrice: 0 };
  }
}

// ===== FORMATEAR NÚMEROS =====
function formatearNumero(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

// ===== TIEMPO RELATIVO =====
function tiempoAgo(timestamp) {
  const segundos = Math.floor(Date.now() / 1000) - timestamp;
  if (segundos < 60) return 'hace ' + segundos + 's';
  if (segundos < 3600) return 'hace ' + Math.floor(segundos / 60) + 'm';
  if (segundos < 86400) return 'hace ' + Math.floor(segundos / 3600) + 'h';
  return 'hace ' + Math.floor(segundos / 86400) + 'd';
}