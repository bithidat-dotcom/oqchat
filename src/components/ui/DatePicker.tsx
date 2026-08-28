import React, { useState, useEffect, useRef } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Check, X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface DatePickerProps {
  label?: string;
  value?: string; // YYYY-MM-DD format
  onChange: (dateStr: string) => void;
  required?: boolean;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DAYS_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export function DatePicker({ label, value, onChange, required }: DatePickerProps) {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  
  // Current view states
  const [viewDate, setViewDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'days' | 'months' | 'years'>('days');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value) {
      const parsed = new Date(value);
      if (!isNaN(parsed.getTime())) {
        setSelectedDate(parsed);
        setViewDate(parsed);
      }
    }
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setViewMode('days');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDaySelect = (day: number) => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const newDate = new Date(year, month, day);
    setSelectedDate(newDate);
    
    // Format to YYYY-MM-DD
    const formatted = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    onChange(formatted);
    setIsOpen(false);
  };

  const handleMonthSelect = (monthIdx: number) => {
    const newDate = new Date(viewDate.getFullYear(), monthIdx, 1);
    setViewDate(newDate);
    setViewMode('days');
  };

  const handleYearSelect = (year: number) => {
    const newDate = new Date(year, viewDate.getMonth(), 1);
    setViewDate(newDate);
    setViewMode('months');
  };

  // Calendar Math
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay();

  const prevMonthDays = new Date(year, month, 0).getDate();

  const daysArray: { day: number; isCurrentMonth: boolean }[] = [];

  // Fill in previous month days
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    daysArray.push({
      day: prevMonthDays - i,
      isCurrentMonth: false
    });
  }

  // Fill in current month days
  for (let i = 1; i <= daysInMonth; i++) {
    daysArray.push({
      day: i,
      isCurrentMonth: true
    });
  }

  // Fill in next month days to make grid perfect multiple of 7
  const totalSlots = 42; // 6 rows of 7 days
  const remainingSlots = totalSlots - daysArray.length;
  for (let i = 1; i <= remainingSlots; i++) {
    daysArray.push({
      day: i,
      isCurrentMonth: false
    });
  }

  const changeMonth = (offset: number) => {
    const newDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + offset, 1);
    setViewDate(newDate);
  };

  // Generate Year Range (from current - 100 to current + 1)
  const currentYear = new Date().getFullYear();
  const startYearRange = currentYear - 90;
  const endYearRange = currentYear;
  const yearsList: number[] = [];
  for (let y = endYearRange; y >= startYearRange; y--) {
    yearsList.push(y);
  }

  const formattedValue = selectedDate 
    ? `${MONTHS[selectedDate.getMonth()]} ${selectedDate.getDate()}, ${selectedDate.getFullYear()}`
    : 'Select Date of Birth';

  return (
    <div className="w-full relative flex flex-col gap-1.5" ref={dropdownRef}>
      {label && (
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}

      {/* Picker Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left text-sm shadow-sm transition-colors hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900"
      >
        <span className={cn("truncate", !selectedDate && "text-zinc-400")}>
          {formattedValue}
        </span>
        <CalendarIcon size={18} className="text-zinc-400 shrink-0 ml-2" />
      </button>

      {/* Premium UX Dropdown */}
      {isOpen && (
        <div className="absolute top-[calc(100%+6px)] left-0 z-50 w-full min-w-[310px] max-w-sm rounded-2xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-800 dark:bg-zinc-900 animate-in fade-in slide-in-from-top-2 duration-150">
          
          {/* Calendar Header */}
          <div className="flex items-center justify-between mb-3.5 border-b border-zinc-100 dark:border-zinc-800 pb-2.5">
            {viewMode === 'days' && (
              <>
                <button
                  type="button"
                  onClick={() => changeMonth(-1)}
                  className="p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-500 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  <ChevronLeft size={16} />
                </button>
                
                <div className="flex gap-1.5 font-semibold text-sm">
                  <button
                    type="button"
                    onClick={() => setViewMode('months')}
                    className="hover:text-brand-500 dark:hover:text-brand-400"
                  >
                    {MONTHS[month]}
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('years')}
                    className="hover:text-brand-500 dark:hover:text-brand-400"
                  >
                    {year}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => changeMonth(1)}
                  className="p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-500 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  <ChevronRight size={16} />
                </button>
              </>
            )}

            {viewMode === 'months' && (
              <>
                <span className="font-semibold text-sm text-zinc-800 dark:text-zinc-200">Select Month</span>
                <button
                  type="button"
                  onClick={() => setViewMode('days')}
                  className="text-xs font-semibold text-brand-500 dark:text-brand-400"
                >
                  Back
                </button>
              </>
            )}

            {viewMode === 'years' && (
              <>
                <span className="font-semibold text-sm text-zinc-800 dark:text-zinc-200">Select Birth Year</span>
                <button
                  type="button"
                  onClick={() => setViewMode('days')}
                  className="text-xs font-semibold text-brand-500 dark:text-brand-400"
                >
                  Back
                </button>
              </>
            )}
          </div>

          {/* DAYS GRID VIEW */}
          {viewMode === 'days' && (
            <div>
              {/* Day Headers */}
              <div className="grid grid-cols-7 gap-1 text-center mb-1">
                {DAYS_SHORT.map((d, i) => (
                  <span key={i} className="text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                    {d}
                  </span>
                ))}
              </div>

              {/* Day Slots */}
              <div className="grid grid-cols-7 gap-1">
                {daysArray.map((item, index) => {
                  const isSelected = selectedDate && 
                    selectedDate.getFullYear() === year && 
                    selectedDate.getMonth() === month && 
                    selectedDate.getDate() === item.day && 
                    item.isCurrentMonth;

                  return (
                    <button
                      key={index}
                      type="button"
                      disabled={!item.isCurrentMonth}
                      onClick={() => handleDaySelect(item.day)}
                      className={cn(
                        "h-8 w-8 mx-auto rounded-lg text-xs font-medium transition-all flex items-center justify-center",
                        item.isCurrentMonth 
                          ? "text-zinc-800 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                          : "text-zinc-300 dark:text-zinc-700 pointer-events-none",
                        isSelected && "bg-brand-500 text-white hover:bg-brand-600 dark:bg-brand-500 dark:text-white"
                      )}
                    >
                      {item.day}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* MONTHS GRID VIEW */}
          {viewMode === 'months' && (
            <div className="grid grid-cols-3 gap-2 py-1 max-h-[220px] overflow-y-auto no-scrollbar">
              {MONTHS.map((m, idx) => {
                const isCurrent = viewDate.getMonth() === idx;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleMonthSelect(idx)}
                    className={cn(
                      "py-2.5 rounded-xl text-xs font-semibold transition-colors",
                      isCurrent
                        ? "bg-brand-500 text-white"
                        : "bg-zinc-50 hover:bg-zinc-100 text-zinc-700 dark:bg-zinc-800/40 dark:hover:bg-zinc-800 dark:text-zinc-300"
                    )}
                  >
                    {m.slice(0, 3)}
                  </button>
                );
              })}
            </div>
          )}

          {/* YEARS GRID VIEW */}
          {viewMode === 'years' && (
            <div className="grid grid-cols-4 gap-2 py-1 max-h-[200px] overflow-y-auto no-scrollbar border-t border-zinc-50 dark:border-zinc-800/50 pt-2">
              {yearsList.map((y) => {
                const isCurrent = viewDate.getFullYear() === y;
                return (
                  <button
                    key={y}
                    type="button"
                    onClick={() => handleYearSelect(y)}
                    className={cn(
                      "py-2 rounded-xl text-xs font-semibold transition-colors",
                      isCurrent
                        ? "bg-brand-500 text-white"
                        : "bg-zinc-50 hover:bg-zinc-100 text-zinc-700 dark:bg-zinc-800/40 dark:hover:bg-zinc-800 dark:text-zinc-300"
                    )}
                  >
                    {y}
                  </button>
                );
              })}
            </div>
          )}

          {/* Dropdown Actions */}
          <div className="flex justify-end gap-2 border-t border-zinc-100 dark:border-zinc-800 pt-2.5 mt-3 shrink-0">
            <button
              type="button"
              onClick={() => {
                setSelectedDate(null);
                onChange('');
                setIsOpen(false);
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-500 hover:text-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setViewMode('days');
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-500 text-white hover:bg-brand-600"
            >
              Done
            </button>
          </div>

        </div>
      )}
    </div>
  );
}
