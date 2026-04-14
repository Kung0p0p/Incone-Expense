import React, { useState, useEffect, useMemo } from 'react';
import { 
  Home, Wallet, CreditCard, Target, Plus, ArrowUpCircle, ArrowDownCircle, 
  CheckCircle2, AlertCircle, X, TrendingUp, Calendar, LineChart, Trash2, 
  Loader2, ChevronRight, Pencil, ChevronLeft 
} from 'lucide-react';
import { 
  LineChart as ReLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell
} from 'recharts';
import { collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';

const appId = 'finance-app-default';
const userId = 'public-user';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [transactions, setTransactions] = useState<any[]>([]);
  const [installments, setInstallments] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [expectedIncome, setExpectedIncome] = useState(35000);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [isInstallmentModalOpen, setIsInstallmentModalOpen] = useState(false);
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, message: '', onConfirm: null as any });
  const [fundPromptDialog, setFundPromptDialog] = useState({ isOpen: false, goal: null as any, amount: '' });
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [tForm, setTForm] = useState({ type: 'expense', amount: '', category: '', customCategory: '', date: new Date().toISOString().split('T')[0], note: '' });
  const [iForm, setIForm] = useState({ name: '', creditCard: '', totalAmount: '', monthsTotal: '', nextDueDate: '' });
  const [gForm, setGForm] = useState({ name: '', targetAmount: '' });
  const [selectedForecastMonth, setSelectedForecastMonth] = useState(0);
  const [selectedTransactionMonth, setSelectedTransactionMonth] = useState(new Date().toISOString().substring(0, 7)); // YYYY-MM
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const creditCardOptions = ['TTB', 'Krungsri', 'Kbank', 'Shopee'];
  const defaultExpenseCats = ['อาหาร', 'เดินทาง', 'ที่พัก', 'บิล/ค่าใช้จ่าย', 'ช้อปปิ้ง', 'ความบันเทิง', 'สุขภาพ'];
  const defaultIncomeCats = ['เงินเดือน', 'ธุรกิจส่วนตัว', 'โบนัส', 'ดอกเบี้ย/ปันผล'];

  useEffect(() => {
    const txRef = collection(db, 'artifacts', appId, 'users', userId, 'transactions');
    const instRef = collection(db, 'artifacts', appId, 'users', userId, 'installments');
    const goalsRef = collection(db, 'artifacts', appId, 'users', userId, 'goals');

    const unsubTx = onSnapshot(txRef, (snapshot) => {
      setTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => b.id.localeCompare(a.id)));
    });
    const unsubInst = onSnapshot(instRef, (snapshot) => {
      setInstallments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubGoals = onSnapshot(goalsRef, (snapshot) => {
      setGoals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => { unsubTx(); unsubInst(); unsubGoals(); };
  }, []);

  const totalIncome = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  const balance = totalIncome - totalExpense;
  const activeInstallments = installments.filter(i => i.status === 'active');
  const totalMonthlyInstallments = activeInstallments.reduce((sum, i) => sum + i.monthlyAmount, 0);
  const nextMonthInstallments = installments.filter(inst => inst.status !== 'completed' && (inst.monthsTotal - inst.monthsPaid) > 1);
  const nextMonthInstallmentTotal = nextMonthInstallments.reduce((sum, inst) => sum + inst.monthlyAmount, 0);
  const nextMonthRemaining = expectedIncome - nextMonthInstallmentTotal;

  const dynamicCategories = useMemo(() => {
    const usedIncomeCats = transactions.filter(t => t.type === 'income').map(t => t.category);
    const usedExpenseCats = transactions.filter(t => t.type === 'expense').map(t => t.category);
    return {
      income: [...new Set([...defaultIncomeCats, ...usedIncomeCats])],
      expense: [...new Set([...defaultExpenseCats, ...usedExpenseCats])]
    };
  }, [transactions]);

  const monthlyForecast = useMemo(() => {
    const months = [];
    const now = new Date();
    
    for (let i = 0; i < 12; i++) {
      const forecastDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const monthLabel = forecastDate.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
      
      const monthInstallments = installments.filter(inst => {
        if (inst.status === 'completed') return false;
        const nextDate = new Date(inst.nextDueDate);
        const monthDiff = (forecastDate.getFullYear() - nextDate.getFullYear()) * 12 + (forecastDate.getMonth() - nextDate.getMonth());
        
        // Show if:
        // 1. It's within the plan duration (0 to monthsTotal - 1)
        // 2. It hasn't been paid yet (monthDiff >= monthsPaid)
        return monthDiff >= 0 && monthDiff < inst.monthsTotal && monthDiff >= inst.monthsPaid;
      });
      
      const totalInst = monthInstallments.reduce((sum, inst) => sum + inst.monthlyAmount, 0);
      
      months.push({
        label: monthLabel,
        income: expectedIncome,
        installments: totalInst,
        remaining: expectedIncome - totalInst,
        details: monthInstallments
      });
    }
    return months;
  }, [installments, expectedIncome]);

  const handleSaveTransaction = async (e: any) => {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    try {
      let finalCategory = tForm.category;
      if (isCustomCategory) finalCategory = tForm.customCategory.trim() || 'อื่นๆ';
      else if (!finalCategory) finalCategory = tForm.type === 'income' ? defaultIncomeCats[0] : defaultExpenseCats[0];

      const id = editingId || Date.now().toString();
      await setDoc(doc(db, 'artifacts', appId, 'users', userId, 'transactions', id), {
        type: tForm.type, amount: parseFloat(tForm.amount) || 0, category: finalCategory, date: tForm.date, note: tForm.note
      });
      setIsTransactionModalOpen(false);
      setIsCustomCategory(false);
      setEditingId(null);
      setTForm({ type: 'expense', amount: '', category: '', customCategory: '', date: new Date().toISOString().split('T')[0], note: '' });
    } catch (error) {
      console.error("Error saving transaction:", error);
      alert("เกิดข้อผิดพลาดในการบันทึกข้อมูล");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveInstallment = async (e: any) => {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    try {
      const total = parseFloat(iForm.totalAmount) || 0;
      const months = parseInt(iForm.monthsTotal) || 1;
      const id = editingId || Date.now().toString();
      
      const existing = installments.find(inst => inst.id === id);
      const monthsPaid = existing ? existing.monthsPaid : 0;

      await setDoc(doc(db, 'artifacts', appId, 'users', userId, 'installments', id), {
        name: iForm.name, creditCard: iForm.creditCard || '', totalAmount: total, monthlyAmount: total / months,
        monthsTotal: months, monthsPaid: monthsPaid, nextDueDate: iForm.nextDueDate, status: monthsPaid >= months ? 'completed' : 'active'
      });
      setIsInstallmentModalOpen(false);
      setEditingId(null);
      setIForm({ name: '', creditCard: '', totalAmount: '', monthsTotal: '', nextDueDate: '' });
    } catch (error) {
      console.error("Error saving installment:", error);
      alert("เกิดข้อผิดพลาดในการบันทึกข้อมูล");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveGoal = async (e: any) => {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    try {
      const id = editingId || Date.now().toString();
      const existing = goals.find(g => g.id === id);
      const currentAmount = existing ? existing.currentAmount : 0;
      const target = parseFloat(gForm.targetAmount) || 0;

      await setDoc(doc(db, 'artifacts', appId, 'users', userId, 'goals', id), {
        name: gForm.name, targetAmount: target, currentAmount: currentAmount, status: currentAmount >= target ? 'completed' : 'in_progress'
      });
      setIsGoalModalOpen(false);
      setEditingId(null);
      setGForm({ name: '', targetAmount: '' });
    } catch (error) {
      console.error("Error saving goal:", error);
      alert("เกิดข้อผิดพลาดในการบันทึกข้อมูล");
    } finally {
      setIsSaving(false);
    }
  };

  const payInstallment = async (installment: any) => {
    if (isSaving) return;
    const txId = Date.now().toString();
    await setDoc(doc(db, 'artifacts', appId, 'users', userId, 'transactions', txId), {
      type: 'expense', amount: installment.monthlyAmount, category: 'ผ่อนชำระ', date: new Date().toISOString().split('T')[0],
      note: `จ่ายค่างวด: ${installment.name} (${installment.monthsPaid + 1}/${installment.monthsTotal}) ${installment.creditCard ? `[${installment.creditCard}]` : ''}`
    });
    const newMonthsPaid = installment.monthsPaid + 1;
    await setDoc(doc(db, 'artifacts', appId, 'users', userId, 'installments', installment.id), {
      ...installment, monthsPaid: newMonthsPaid, status: newMonthsPaid >= installment.monthsTotal ? 'completed' : 'active'
    });
  };

  const submitFundGoal = async (e: any) => {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    try {
      const amount = parseFloat(fundPromptDialog.amount);
      if (isNaN(amount) || amount <= 0) return;
      const goal = fundPromptDialog.goal;
      const txId = Date.now().toString();
      await setDoc(doc(db, 'artifacts', appId, 'users', userId, 'transactions', txId), {
        type: 'expense', amount: amount, category: 'ออมเงิน', date: new Date().toISOString().split('T')[0], note: `เก็บเงินเข้าเป้าหมาย: ${goal.name}`
      });
      const newAmount = goal.currentAmount + amount;
      await setDoc(doc(db, 'artifacts', appId, 'users', userId, 'goals', goal.id), {
        ...goal, currentAmount: newAmount, status: newAmount >= goal.targetAmount ? 'completed' : 'in_progress'
      });
      setFundPromptDialog({ isOpen: false, goal: null, amount: '' });
    } catch (error) {
      console.error("Error funding goal:", error);
      alert("เกิดข้อผิดพลาดในการบันทึกข้อมูล");
    } finally {
      setIsSaving(false);
    }
  };

  const requestDeleteTransaction = (id: string) => setConfirmDialog({ 
    isOpen: true, 
    message: 'คุณแน่ใจหรือไม่ว่าต้องการลบรายการนี้?', 
    onConfirm: async () => { 
      if (isSaving) return;
      setIsSaving(true);
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'users', userId, 'transactions', id));
        setConfirmDialog({ isOpen: false, message: '', onConfirm: null as any });
      } catch (error) {
        console.error("Error deleting transaction:", error);
        alert("เกิดข้อผิดพลาดในการลบข้อมูล");
      } finally {
        setIsSaving(false);
      }
    }
  });

  const requestDeleteInstallment = (id: string) => setConfirmDialog({ 
    isOpen: true, 
    message: 'คุณแน่ใจหรือไม่ว่าต้องการลบรายการผ่อนนี้?', 
    onConfirm: async () => { 
      if (isSaving) return;
      setIsSaving(true);
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'users', userId, 'installments', id));
        setConfirmDialog({ isOpen: false, message: '', onConfirm: null as any });
      } catch (error) {
        console.error("Error deleting installment:", error);
        alert("เกิดข้อผิดพลาดในการลบข้อมูล");
      } finally {
        setIsSaving(false);
      }
    }
  });

  const requestDeleteGoal = (id: string) => setConfirmDialog({ 
    isOpen: true, 
    message: 'คุณแน่ใจหรือไม่ว่าต้องการลบเป้าหมายนี้?', 
    onConfirm: async () => { 
      if (isSaving) return;
      setIsSaving(true);
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'users', userId, 'goals', id));
        setConfirmDialog({ isOpen: false, message: '', onConfirm: null as any });
      } catch (error) {
        console.error("Error deleting goal:", error);
        alert("เกิดข้อผิดพลาดในการลบข้อมูล");
      } finally {
        setIsSaving(false);
      }
    }
  });

  const openAddTransaction = () => {
    setEditingId(null);
    setTForm({ type: 'expense', amount: '', category: '', customCategory: '', date: new Date().toISOString().split('T')[0], note: '' });
    setIsTransactionModalOpen(true);
  };

  const openAddInstallment = () => {
    setEditingId(null);
    setIForm({ name: '', creditCard: '', totalAmount: '', monthsTotal: '', nextDueDate: '' });
    setIsInstallmentModalOpen(true);
  };

  const openAddGoal = () => {
    setEditingId(null);
    setGForm({ name: '', targetAmount: '' });
    setIsGoalModalOpen(true);
  };

  const openEditTransaction = (t: any) => {
    setEditingId(t.id);
    setTForm({ type: t.type, amount: t.amount.toString(), category: t.category, customCategory: '', date: t.date, note: t.note || '' });
    setIsTransactionModalOpen(true);
  };

  const openEditInstallment = (i: any) => {
    setEditingId(i.id);
    setIForm({ name: i.name, creditCard: i.creditCard, totalAmount: i.totalAmount.toString(), monthsTotal: i.monthsTotal.toString(), nextDueDate: i.nextDueDate });
    setIsInstallmentModalOpen(true);
  };

  const openEditGoal = (g: any) => {
    setEditingId(g.id);
    setGForm({ name: g.name, targetAmount: g.targetAmount.toString() });
    setIsGoalModalOpen(true);
  };

  const convertToInstallment = (t: any) => {
    setEditingId(null);
    setIForm({ 
      name: t.note || t.category, 
      creditCard: '', 
      totalAmount: t.amount.toString(), 
      monthsTotal: '10', 
      nextDueDate: t.date 
    });
    setIsInstallmentModalOpen(true);
  };

  const formatMoney = (amount: number) => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(amount);

  const menuItems = [
    { id: 'dashboard', icon: Home, label: 'แดชบอร์ดภาพรวม' },
    { id: 'transactions', icon: Wallet, label: 'บันทึกรายรับ-รายจ่าย' },
    { id: 'installments', icon: CreditCard, label: 'จัดการภาระผ่อน' },
    { id: 'goals', icon: Target, label: 'เป้าหมายการออม' },
    { id: 'forecast', icon: LineChart, label: 'รายจ่ายล่วงหน้า' },
  ];

  const COLORS = ['#6366f1', '#10b981', '#f43f5e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

  const categoryData = transactions
    .filter(t => t.date.startsWith(selectedTransactionMonth) && t.type === 'expense')
    .reduce((acc: any[], t) => {
      const existing = acc.find(item => item.name === t.category);
      if (existing) {
        existing.value += t.amount;
      } else {
        acc.push({ name: t.category, value: t.amount });
      }
      return acc;
    }, []);

  const monthlyIncome = transactions
    .filter(t => t.date.startsWith(selectedTransactionMonth) && t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);
  
  const monthlyExpense = transactions
    .filter(t => t.date.startsWith(selectedTransactionMonth) && t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans text-slate-900">
      <aside className="hidden md:flex flex-col w-64 bg-slate-900 text-slate-300 fixed inset-y-0 left-0 z-30 shadow-xl">
        <div className="p-6 pb-2">
          <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center">
            <span className="bg-gradient-to-br from-teal-400 to-indigo-500 bg-clip-text text-transparent">Smart</span>Finance
          </h1>
        </div>
        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
          {menuItems.map((item) => (
            <button key={item.id} onClick={() => setActiveTab(item.id)} className={`w-full flex items-center px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${activeTab === item.id ? 'bg-indigo-500/10 text-indigo-400' : 'hover:bg-slate-800 hover:text-white'}`}>
              <item.icon className={`w-5 h-5 mr-3 ${activeTab === item.id ? 'text-indigo-400' : 'opacity-70'}`} />{item.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex-1 md:ml-64 flex flex-col min-h-screen pb-20 md:pb-0">
        <header className="md:hidden bg-white/80 backdrop-blur-md px-6 py-4 sticky top-0 z-20 border-b border-slate-200 flex justify-between items-center shadow-sm">
          <h1 className="text-xl font-extrabold bg-gradient-to-br from-teal-500 to-indigo-600 bg-clip-text text-transparent">SmartFinance</h1>
        </header>

        <div className="p-4 md:p-8 flex-1">
          {activeTab === 'dashboard' && (
            <div className="space-y-6 max-w-6xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-teal-500 to-emerald-600 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
                  <h2 className="text-teal-100 text-sm font-medium mb-1">ยอดเงินคงเหลือปัจจุบัน</h2>
                  <div className="text-4xl font-bold mb-4">{formatMoney(balance)}</div>
                  <div className="flex justify-between items-center border-t border-teal-400/30 pt-4">
                    <div><div className="text-teal-100 text-xs mb-1">รายรับ</div><div className="flex items-center text-sm font-semibold"><ArrowUpCircle className="w-4 h-4 mr-1 text-teal-200" />{formatMoney(totalIncome)}</div></div>
                    <div className="text-right"><div className="text-teal-100 text-xs mb-1">รายจ่าย</div><div className="flex items-center text-sm font-semibold justify-end"><ArrowDownCircle className="w-4 h-4 mr-1 text-red-200" />{formatMoney(totalExpense)}</div></div>
                  </div>
                </div>
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-4"><h2 className="text-slate-500 text-sm font-medium">ภาระผ่อนเดือนนี้</h2><div className="p-2 bg-indigo-50 text-indigo-500 rounded-lg"><CreditCard className="w-5 h-5"/></div></div>
                    <div className="text-3xl font-bold text-slate-800 mb-1">{formatMoney(totalMonthlyInstallments)}</div>
                    <p className="text-xs text-slate-400">จาก {activeInstallments.length} รายการที่กำลังผ่อน</p>
                  </div>
                  <button onClick={() => setActiveTab('installments')} className="mt-4 text-sm text-indigo-600 font-medium flex items-center">จัดการรายการผ่อน <ChevronRight className="w-4 h-4 ml-1" /></button>
                </div>
                <div className="bg-slate-800 rounded-2xl p-6 shadow-lg text-white flex flex-col justify-between relative overflow-hidden">
                  <div>
                    <div className="flex items-center justify-between mb-4"><h2 className="text-slate-300 text-sm font-medium">สรุปยอดเดือนหน้าล่วงหน้า</h2><div className="p-2 bg-slate-700/50 text-indigo-300 rounded-lg"><Calendar className="w-5 h-5"/></div></div>
                    <div className="space-y-3 relative z-10">
                      <div className="flex justify-between items-end border-b border-slate-700 pb-2"><div className="text-xs text-slate-400">รายรับคาดหวัง</div><div className="text-sm font-medium text-emerald-400">{formatMoney(expectedIncome)}</div></div>
                      <div className="flex justify-between items-center border-b border-slate-700 pb-2"><div className="text-xs text-slate-400">หักค่าผ่อน</div><div className="text-sm font-medium text-rose-400">-{formatMoney(nextMonthInstallmentTotal)}</div></div>
                      <div className="flex justify-between items-center pt-1"><div className="text-sm font-medium text-slate-200">เหลือใช้จ่าย</div><div className={`text-xl font-bold ${nextMonthRemaining >= 0 ? 'text-teal-400' : 'text-rose-500'}`}>{formatMoney(nextMonthRemaining)}</div></div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase">สรุปเดือน {selectedTransactionMonth}</div>
                    <div className="flex gap-4 mt-1">
                      <div>
                        <div className="text-[10px] text-emerald-500 font-medium">รายรับ</div>
                        <div className="text-sm font-bold text-emerald-600">{formatMoney(monthlyIncome)}</div>
                      </div>
                      <div className="border-l border-slate-100 pl-4">
                        <div className="text-[10px] text-rose-500 font-medium">รายจ่าย</div>
                        <div className="text-sm font-bold text-rose-600">{formatMoney(monthlyExpense)}</div>
                      </div>
                    </div>
                  </div>
                </div>
                {monthlyForecast.slice(1, 4).map((m, i) => (
                  <div key={i} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase">{m.label}</div>
                      <div className={`text-lg font-bold ${m.remaining >= 0 ? 'text-slate-800' : 'text-rose-600'}`}>
                        {formatMoney(m.remaining)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-slate-400">ผ่อนรวม</div>
                      <div className="text-xs font-bold text-rose-500">-{formatMoney(m.installments)}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">แนวโน้มรายจ่ายล่วงหน้า 12 เดือน</h3>
                    <button onClick={() => setActiveTab('forecast')} className="text-xs text-indigo-600 font-bold hover:underline">ดูรายละเอียดรายเดือน</button>
                  </div>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ReLineChart data={monthlyForecast.map(m => ({
                        name: m.label.split(' ')[0],
                        'รายรับ': m.income,
                        'รายจ่ายผ่อน': m.installments,
                        'เงินคงเหลือ': m.remaining
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8'}} />
                        <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8'}} />
                        <Tooltip 
                          contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                          formatter={(value: number) => [formatMoney(value), '']}
                        />
                        <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{paddingBottom: '20px', fontSize: '12px'}} />
                        <Line type="monotone" dataKey="รายรับ" stroke="#10b981" strokeWidth={3} dot={{r: 4}} activeDot={{r: 6}} />
                        <Line type="monotone" dataKey="รายจ่ายผ่อน" stroke="#f43f5e" strokeWidth={3} dot={{r: 4}} activeDot={{r: 6}} />
                        <Line type="monotone" dataKey="เงินคงเหลือ" stroke="#6366f1" strokeWidth={3} strokeDasharray="5 5" dot={false} />
                      </ReLineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">สัดส่วนรายจ่าย</h3>
                    <div className="flex items-center bg-slate-50 rounded-lg px-2 py-1">
                      <Calendar className="w-3 h-3 text-slate-400 mr-2" />
                      <input 
                        type="month" 
                        value={selectedTransactionMonth}
                        onChange={(e) => setSelectedTransactionMonth(e.target.value)}
                        className="bg-transparent border-none text-[10px] font-bold text-indigo-600 outline-none cursor-pointer"
                      />
                    </div>
                  </div>
                  <div className="h-[300px] w-full flex flex-col md:flex-row items-center">
                    <div className="w-full md:w-1/2 h-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={categoryData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            {categoryData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip 
                            contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                            formatter={(value: number) => [formatMoney(value), '']}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="w-full md:w-1/2 space-y-2 mt-4 md:mt-0">
                      {categoryData.length > 0 ? categoryData.map((item, index) => (
                        <div key={index} className="flex items-center justify-between text-xs">
                          <div className="flex items-center">
                            <div className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                            <span className="text-slate-600 font-medium">{item.name}</span>
                          </div>
                          <span className="font-bold text-slate-800">{formatMoney(item.value)}</span>
                        </div>
                      )) : (
                        <div className="text-center text-slate-400 italic text-xs py-10">ไม่มีข้อมูลรายจ่ายในเดือนนี้</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'transactions' && (
            <div className="space-y-4 max-w-5xl mx-auto">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                <h2 className="text-2xl font-bold text-slate-800">รายรับ-รายจ่าย</h2>
                <div className="flex items-center gap-3 w-full md:w-auto">
                  <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-1.5 flex items-center gap-2 flex-1 md:flex-none">
                    <Calendar className="w-4 h-4 text-slate-400 ml-2" />
                    <input 
                      type="month" 
                      value={selectedTransactionMonth}
                      onChange={(e) => setSelectedTransactionMonth(e.target.value)}
                      className="bg-transparent border-none text-sm font-bold text-indigo-600 outline-none cursor-pointer"
                    />
                  </div>
                  <button onClick={openAddTransaction} className="bg-teal-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium flex items-center whitespace-nowrap"><Plus className="w-4 h-4 mr-2" /> เพิ่มรายการ</button>
                </div>
              </div>
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                {transactions.filter(t => t.date.startsWith(selectedTransactionMonth)).length > 0 ? (
                  transactions
                    .filter(t => t.date.startsWith(selectedTransactionMonth))
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .map((t, index) => (
                      <div key={t.id} className={`p-4 flex justify-between items-center ${index !== 0 ? 'border-t border-slate-100' : ''}`}>
                        <div className="flex items-center gap-4">
                          <div className={`p-3 rounded-full ${t.type === 'income' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                            {t.type === 'income' ? <ArrowUpCircle className="w-6 h-6" /> : <ArrowDownCircle className="w-6 h-6" />}
                          </div>
                          <div><div className="font-semibold text-slate-800">{t.category}</div><div className="text-xs text-slate-400">{t.date}</div></div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right"><div className={`font-bold ${t.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>{t.type === 'income' ? '+' : '-'}{formatMoney(t.amount)}</div></div>
                          <div className="flex items-center gap-1">
                            {t.type === 'expense' && (
                              <button 
                                onClick={() => convertToInstallment(t)} 
                                className="p-2 text-slate-300 hover:text-indigo-500 transition-colors"
                                title="เปลี่ยนเป็นรายการผ่อน"
                              >
                                <CreditCard className="w-4 h-4" />
                              </button>
                            )}
                            <button onClick={() => openEditTransaction(t)} className="p-2 text-slate-300 hover:text-indigo-500 transition-colors"><Pencil className="w-4 h-4" /></button>
                            <button onClick={() => requestDeleteTransaction(t.id)} className="p-2 text-slate-300 hover:text-rose-500 transition-colors"><Trash2 className="w-5 h-5" /></button>
                          </div>
                        </div>
                      </div>
                    ))
                ) : (
                  <div className="p-12 text-center text-slate-400 italic">
                    ไม่มีรายการในเดือนนี้
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'installments' && (
            <div className="space-y-4 max-w-5xl mx-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-slate-800">จัดการภาระผ่อน</h2>
                <button onClick={openAddInstallment} className="bg-indigo-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium flex items-center"><Plus className="w-4 h-4 mr-2" /> เพิ่มภาระผ่อน</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {installments.map((item) => (
                  <div key={item.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-bold text-slate-800 text-xl">{item.name}</h3>
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEditInstallment(item)} className="p-2 text-slate-300 hover:text-indigo-500 transition-colors"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => requestDeleteInstallment(item.id)} className="p-2 text-slate-300 hover:text-rose-500 transition-colors"><Trash2 className="w-5 h-5" /></button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm mb-5 bg-slate-50 p-3 rounded-xl">
                      <div><div className="text-slate-400 text-xs">ยอดหนี้รวม</div><div className="font-semibold text-slate-700">{formatMoney(item.totalAmount)}</div></div>
                      <div><div className="text-slate-400 text-xs">จ่ายเดือนละ</div><div className="font-bold text-rose-500">{formatMoney(item.monthlyAmount)}</div></div>
                    </div>
                    {item.status === 'active' && (
                      <button onClick={() => payInstallment(item)} className="w-full bg-slate-800 text-white text-sm font-medium py-2.5 rounded-xl">กดจ่ายงวดนี้</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'goals' && (
            <div className="space-y-4 max-w-5xl mx-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-slate-800">เป้าหมายการออม</h2>
                <button onClick={openAddGoal} className="bg-fuchsia-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium flex items-center"><Plus className="w-4 h-4 mr-2" /> สร้างเป้าหมาย</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {goals.map((goal) => (
                  <div key={goal.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="font-bold text-slate-800 text-xl">{goal.name}</h3>
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEditGoal(goal)} className="p-2 text-slate-300 hover:text-indigo-500 transition-colors"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => requestDeleteGoal(goal.id)} className="p-2 text-slate-300 hover:text-rose-500 transition-colors"><Trash2 className="w-5 h-5" /></button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm mb-5">
                      <div className="bg-slate-50 p-3 rounded-xl"><div className="text-slate-400 text-xs">เก็บแล้ว</div><div className="font-bold text-fuchsia-600">{formatMoney(goal.currentAmount)}</div></div>
                      <div className="bg-slate-50 p-3 rounded-xl"><div className="text-slate-400 text-xs">เป้าหมาย</div><div className="font-semibold text-slate-700">{formatMoney(goal.targetAmount)}</div></div>
                    </div>
                    {goal.status === 'in_progress' && (
                      <button onClick={() => { setFundPromptDialog({ isOpen: true, goal, amount: '' }); }} className="w-full bg-fuchsia-50 text-fuchsia-700 font-medium py-2.5 rounded-xl flex justify-center items-center"><TrendingUp className="w-4 h-4 mr-2" /> หยอดกระปุกเพิ่ม</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {activeTab === 'forecast' && (
             <div className="space-y-6 max-w-7xl mx-auto">
               <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                 <h2 className="text-2xl font-bold text-slate-800">รายจ่ายล่วงหน้า</h2>
                 <div className="flex flex-wrap items-center gap-3">
                   <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-2 flex items-center gap-2">
                     <span className="text-xs font-medium text-slate-500 pl-2">เลือกเดือน:</span>
                     <div className="flex items-center bg-slate-50 rounded-lg overflow-hidden">
                       <button 
                         onClick={() => setSelectedForecastMonth(prev => Math.max(0, prev - 1))}
                         disabled={selectedForecastMonth === 0}
                         className="p-1.5 hover:bg-slate-200 disabled:opacity-30 transition-colors"
                       >
                         <ChevronLeft className="w-4 h-4 text-slate-600" />
                       </button>
                       <select 
                         value={selectedForecastMonth} 
                         onChange={e => setSelectedForecastMonth(Number(e.target.value))}
                         className="bg-transparent border-none py-1.5 px-2 text-sm font-bold text-indigo-600 outline-none appearance-none cursor-pointer"
                       >
                         {monthlyForecast.map((m, idx) => (
                           <option key={idx} value={idx}>{m.label}</option>
                         ))}
                       </select>
                       <button 
                         onClick={() => setSelectedForecastMonth(prev => Math.min(monthlyForecast.length - 1, prev + 1))}
                         disabled={selectedForecastMonth === monthlyForecast.length - 1}
                         className="p-1.5 hover:bg-slate-200 disabled:opacity-30 transition-colors"
                       >
                         <ChevronRight className="w-4 h-4 text-slate-600" />
                       </button>
                     </div>
                   </div>
                   <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-2 flex items-center gap-2">
                     <span className="text-xs font-medium text-slate-500 pl-2">รายรับคาดหวัง:</span>
                     <input 
                       type="number" 
                       value={expectedIncome} 
                       onChange={e => setExpectedIncome(Number(e.target.value))} 
                       className="w-24 bg-slate-50 border-none rounded-lg py-1.5 px-3 text-sm font-bold text-indigo-600 outline-none" 
                     />
                   </div>
                 </div>
               </div>

               {/* Selected Month Summary */}
               <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                   <div className="text-slate-400 text-xs font-medium mb-1">รายรับคาดการณ์ ({monthlyForecast[selectedForecastMonth].label})</div>
                   <div className="text-2xl font-bold text-emerald-600">{formatMoney(monthlyForecast[selectedForecastMonth].income)}</div>
                 </div>
                 <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                   <div className="text-slate-400 text-xs font-medium mb-1">ยอดผ่อนชำระรวม</div>
                   <div className="text-2xl font-bold text-rose-500">{formatMoney(monthlyForecast[selectedForecastMonth].installments)}</div>
                 </div>
                 <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                   <div className="text-slate-400 text-xs font-medium mb-1">เงินคงเหลือสุทธิ</div>
                   <div className={`text-2xl font-bold ${monthlyForecast[selectedForecastMonth].remaining >= 0 ? 'text-teal-600' : 'text-rose-600'}`}>
                     {formatMoney(monthlyForecast[selectedForecastMonth].remaining)}
                   </div>
                 </div>
               </div>

               <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                 <div className="lg:col-span-2 space-y-6">
                   <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                     <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                       <h3 className="font-bold text-slate-800">รายการผ่อนชำระในเดือนนี้</h3>
                       <span className="text-xs text-slate-400">{monthlyForecast[selectedForecastMonth].details.length} รายการ</span>
                     </div>
                     <div className="overflow-x-auto">
                       <table className="w-full text-left border-collapse">
                         <thead>
                           <tr className="bg-slate-50 border-b border-slate-100">
                             <th className="px-6 py-4 text-sm font-bold text-slate-600">ชื่อรายการ</th>
                             <th className="px-6 py-4 text-sm font-bold text-slate-600">บัตรที่ใช้</th>
                             <th className="px-6 py-4 text-sm font-bold text-slate-600">ยอดที่ต้องจ่าย</th>
                             <th className="px-6 py-4 text-sm font-bold text-slate-600">งวดที่</th>
                             <th className="px-6 py-4 text-sm font-bold text-slate-600">สถานะ</th>
                           </tr>
                         </thead>
                         <tbody>
                           {monthlyForecast[selectedForecastMonth].details.length > 0 ? (
                             monthlyForecast[selectedForecastMonth].details.map((d, idx) => {
                               const nextDate = new Date(d.nextDueDate);
                               const forecastDate = new Date(new Date().getFullYear(), new Date().getMonth() + selectedForecastMonth, 1);
                               const monthDiff = (forecastDate.getFullYear() - nextDate.getFullYear()) * 12 + (forecastDate.getMonth() - nextDate.getMonth());
                               const installmentNum = monthDiff + 1;

                               return (
                                 <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                   <td className="px-6 py-4 font-bold text-slate-700">{d.name}</td>
                                   <td className="px-6 py-4">
                                     <span className="px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold border border-indigo-100">
                                       {d.creditCard || 'ไม่ระบุ'}
                                     </span>
                                   </td>
                                   <td className="px-6 py-4 text-rose-500 font-bold">{formatMoney(d.monthlyAmount)}</td>
                                   <td className="px-6 py-4 text-slate-500 text-sm">{installmentNum} / {d.monthsTotal}</td>
                                   <td className="px-6 py-4">
                                     <button 
                                       onClick={() => payInstallment(d)}
                                       className="text-[10px] bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg font-bold transition-colors shadow-sm"
                                     >
                                       จ่ายงวดนี้
                                     </button>
                                   </td>
                                 </tr>
                               );
                             })
                           ) : (
                             <tr>
                               <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">
                                 ไม่มีรายการผ่อนชำระในเดือนนี้
                               </td>
                             </tr>
                           )}
                         </tbody>
                       </table>
                     </div>
                   </div>

                   <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                     <h3 className="text-sm font-bold text-slate-400 mb-4 uppercase tracking-wider">สรุปภาพรวม 12 เดือน</h3>
                     <div className="overflow-x-auto">
                       <table className="w-full text-left border-collapse">
                         <thead>
                           <tr className="bg-slate-50 border-b border-slate-100">
                             {monthlyForecast.map((m, i) => (
                               <th key={i} className="px-3 py-2 text-[10px] font-bold text-slate-500 text-center border-r border-slate-100 last:border-0">
                                 {m.label.split(' ')[0]}
                               </th>
                             ))}
                           </tr>
                         </thead>
                         <tbody>
                           <tr>
                             {monthlyForecast.map((m, i) => (
                               <td key={i} className={`px-3 py-2 text-[10px] font-bold text-center border-r border-slate-100 last:border-0 ${m.remaining >= 0 ? 'text-teal-600' : 'text-rose-600'}`}>
                                 {formatMoney(m.remaining).replace('฿', '')}
                               </td>
                             ))}
                           </tr>
                         </tbody>
                       </table>
                     </div>
                   </div>
                 </div>

                 <div className="space-y-6">
                   <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                     <h3 className="font-bold text-slate-800 mb-4">สรุปตามบัตรเครดิต</h3>
                     <div className="space-y-4">
                       {creditCardOptions.map(card => {
                         const cardTotal = monthlyForecast[selectedForecastMonth].details
                           .filter(d => d.creditCard === card)
                           .reduce((sum, d) => sum + d.monthlyAmount, 0);
                         
                         if (cardTotal === 0) return null;

                         return (
                           <div key={card} className="flex justify-between items-center p-3 bg-slate-50 rounded-2xl">
                             <div>
                               <div className="text-xs font-bold text-slate-400">{card}</div>
                               <div className="text-sm font-bold text-slate-700">{formatMoney(cardTotal)}</div>
                             </div>
                             <div className="w-12 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                               <div 
                                 className="h-full bg-indigo-500" 
                                 style={{ width: `${Math.min(100, (cardTotal / monthlyForecast[selectedForecastMonth].installments) * 100)}%` }}
                                />
                             </div>
                           </div>
                         );
                       })}
                       {monthlyForecast[selectedForecastMonth].details.filter(d => !d.creditCard).length > 0 && (
                         <div className="flex justify-between items-center p-3 bg-slate-50 rounded-2xl">
                           <div>
                             <div className="text-xs font-bold text-slate-400">อื่นๆ / ไม่ระบุ</div>
                             <div className="text-sm font-bold text-slate-700">
                               {formatMoney(monthlyForecast[selectedForecastMonth].details
                                 .filter(d => !d.creditCard)
                                 .reduce((sum, d) => sum + d.monthlyAmount, 0))}
                             </div>
                           </div>
                         </div>
                       )}
                     </div>
                   </div>

                   <div className="bg-indigo-600 rounded-3xl p-6 text-white shadow-lg">
                     <h3 className="font-bold mb-2">คำแนะนำ</h3>
                     <p className="text-xs text-indigo-100 leading-relaxed">
                       ในเดือน {monthlyForecast[selectedForecastMonth].label} คุณมีภาระผ่อนทั้งหมด {monthlyForecast[selectedForecastMonth].details.length} รายการ 
                       {monthlyForecast[selectedForecastMonth].remaining < 0 ? ' ซึ่งเกินกว่ารายรับคาดการณ์ โปรดวางแผนสำรองเงินล่วงหน้า' : ' ซึ่งยังอยู่ในเกณฑ์ที่จัดการได้'}
                     </p>
                   </div>
                 </div>
               </div>
             </div>
          )}
        </div>
      </main>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex justify-around p-1.5 pb-safe z-30">
        {menuItems.map((item) => (
          <button key={item.id} onClick={() => setActiveTab(item.id)} className={`flex flex-col items-center p-2.5 w-full rounded-xl ${activeTab === item.id ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400'}`}>
            <item.icon className="w-5 h-5 mb-1" /><span className="text-[10px] font-semibold">{item.label.split(' ')[0]}</span>
          </button>
        ))}
      </nav>

      {/* Modals */}
      {isTransactionModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 relative">
            <button onClick={() => { setIsTransactionModalOpen(false); setEditingId(null); }} className="absolute right-5 top-5"><X className="w-5 h-5"/></button>
            <h3 className="text-xl font-extrabold mb-5">{editingId ? 'แก้ไขรายการ' : 'บันทึกรายการใหม่'}</h3>
            <form onSubmit={handleSaveTransaction} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 ml-1">จำนวนเงิน (บาท)</label>
                <input type="number" required value={tForm.amount} onChange={e => setTForm({...tForm, amount: e.target.value})} className="w-full border-2 rounded-xl py-3 px-4" placeholder="0.00" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 ml-1">หมวดหมู่</label>
                <select required value={tForm.category} onChange={e => setTForm({...tForm, category: e.target.value})} className="w-full border-2 rounded-xl py-3 px-4">
                  <option value="" disabled>-- เลือกหมวดหมู่ --</option>
                  {(tForm.type === 'income' ? dynamicCategories.income : dynamicCategories.expense).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 ml-1">วันที่ทำรายการ</label>
                <input type="date" required value={tForm.date} onChange={e => setTForm({...tForm, date: e.target.value})} className="w-full border-2 rounded-xl py-3 px-4" />
              </div>
              <button type="submit" disabled={isSaving} className="w-full bg-slate-900 text-white font-bold py-3.5 rounded-xl transition-transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center">
                {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingId ? 'บันทึกการแก้ไข' : 'บันทึกรายการ'}
              </button>
            </form>
          </div>
        </div>
      )}

      {isInstallmentModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 relative">
            <button onClick={() => { setIsInstallmentModalOpen(false); setEditingId(null); }} className="absolute right-5 top-5"><X className="w-5 h-5"/></button>
            <h3 className="text-xl font-extrabold mb-5">{editingId ? 'แก้ไขรายการผ่อน' : 'เพิ่มรายการภาระผ่อน'}</h3>
            <form onSubmit={handleSaveInstallment} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 ml-1">ชื่อรายการ (เช่น ผ่อนมือถือ)</label>
                <input type="text" required value={iForm.name} onChange={e => setIForm({...iForm, name: e.target.value})} className="w-full border-2 rounded-xl py-3 px-4" placeholder="ชื่อรายการ" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 ml-1">บัตรเครดิตที่ใช้</label>
                <select required value={iForm.creditCard} onChange={e => setIForm({...iForm, creditCard: e.target.value})} className="w-full border-2 rounded-xl py-3 px-4">
                  <option value="" disabled>-- เลือกบัตรเครดิต --</option>
                  {creditCardOptions.map(card => <option key={card} value={card}>{card}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 ml-1">ยอดรวมทั้งหมด</label>
                  <input type="number" required value={iForm.totalAmount} onChange={e => setIForm({...iForm, totalAmount: e.target.value})} className="w-full border-2 rounded-xl py-3 px-4" placeholder="0.00" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 ml-1">จำนวนงวด</label>
                  <input type="number" required value={iForm.monthsTotal} onChange={e => setIForm({...iForm, monthsTotal: e.target.value})} className="w-full border-2 rounded-xl py-3 px-4" placeholder="งวด" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 ml-1">วันที่เริ่มผ่อนงวดแรก</label>
                <input type="date" required value={iForm.nextDueDate} onChange={e => setIForm({...iForm, nextDueDate: e.target.value})} className="w-full border-2 rounded-xl py-3 px-4" />
                <p className="text-[10px] text-slate-400 mt-1 ml-1">* ระบบจะใช้เป็นวันเริ่มต้นในการคำนวณรายจ่ายล่วงหน้า</p>
              </div>

              {iForm.totalAmount && iForm.monthsTotal && parseFloat(iForm.totalAmount) > 0 && parseInt(iForm.monthsTotal) > 0 && (
                <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100 flex justify-between items-center animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="text-xs font-bold text-indigo-600 uppercase tracking-wider">ยอดผ่อนต่อเดือน</div>
                  <div className="text-xl font-black text-indigo-700">{formatMoney(parseFloat(iForm.totalAmount) / parseInt(iForm.monthsTotal))}</div>
                </div>
              )}

              <button type="submit" disabled={isSaving} className="w-full bg-indigo-600 text-white font-bold py-3.5 rounded-xl transition-transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center">
                {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingId ? 'บันทึกการแก้ไข' : 'บันทึกภาระผ่อน'}
              </button>
            </form>
          </div>
        </div>
      )}

      {isGoalModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 relative">
            <button onClick={() => { setIsGoalModalOpen(false); setEditingId(null); }} className="absolute right-5 top-5"><X className="w-5 h-5"/></button>
            <h3 className="text-xl font-extrabold mb-5">{editingId ? 'แก้ไขเป้าหมาย' : 'ตั้งเป้าหมายการออม'}</h3>
            <form onSubmit={handleSaveGoal} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 ml-1">ชื่อเป้าหมาย</label>
                <input type="text" required value={gForm.name} onChange={e => setGForm({...gForm, name: e.target.value})} className="w-full border-2 rounded-xl py-3 px-4" placeholder="เช่น ทริปญี่ปุ่น" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 ml-1">ยอดเงินที่ต้องการ (บาท)</label>
                <input type="number" required value={gForm.targetAmount} onChange={e => setGForm({...gForm, targetAmount: e.target.value})} className="w-full border-2 rounded-xl py-3 px-4" placeholder="0.00" />
              </div>
              <button type="submit" disabled={isSaving} className="w-full bg-fuchsia-600 text-white font-bold py-3.5 rounded-xl transition-transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center">
                {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingId ? 'บันทึกการแก้ไข' : 'สร้างเป้าหมาย'}
              </button>
            </form>
          </div>
        </div>
      )}

      {confirmDialog.isOpen && (
        <div className="fixed inset-0 bg-slate-900/40 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 text-center">
            <h3 className="text-xl font-bold mb-2">ยืนยันการลบ</h3>
            <p className="text-slate-500 text-sm mb-6">{confirmDialog.message}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDialog({ isOpen: false, message: '', onConfirm: null as any })} className="flex-1 py-3 rounded-xl border-2 disabled:opacity-50" disabled={isSaving}>ยกเลิก</button>
              <button onClick={confirmDialog.onConfirm} disabled={isSaving} className="flex-1 py-3 rounded-xl bg-rose-500 text-white disabled:opacity-50 flex items-center justify-center">
                {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                ลบรายการ
              </button>
            </div>
          </div>
        </div>
      )}

      {fundPromptDialog.isOpen && (
        <div className="fixed inset-0 bg-slate-900/40 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 relative">
            <button onClick={() => setFundPromptDialog({ isOpen: false, goal: null as any, amount: '' })} className="absolute right-5 top-5"><X className="w-5 h-5"/></button>
            <h3 className="text-xl font-extrabold mb-1">หยอดกระปุก</h3>
            <form onSubmit={submitFundGoal} className="mt-4">
              <input type="number" required value={fundPromptDialog.amount} onChange={e => setFundPromptDialog({...fundPromptDialog, amount: e.target.value})} className="w-full border-2 rounded-xl py-3 px-4 mb-4" placeholder="จำนวนเงิน" />
              <button type="submit" disabled={isSaving} className="w-full bg-fuchsia-600 text-white font-bold py-3.5 rounded-xl flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed">
                {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                บันทึกเงินออม
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
