import { Button } from './ui/index.js';
import StaffdeckIcon from './StaffdeckIcon.js';

export type EmptyEmployeeStateProps = {
  isAdmin: boolean;
  onCreate: () => void;
  onBrowsePlatform: () => void;
};

/** Empty-state placeholder shown when the tenant has no digital employees yet. */
export default function EmptyEmployeeState({
  isAdmin,
  onCreate,
  onBrowsePlatform,
}: EmptyEmployeeStateProps) {
  return (
    <div className="min-h-full w-full min-w-0 max-w-full box-border px-[48px] pt-[32px] pb-[43px] max-[900px]:px-[16px]">
      <div className="mx-auto flex min-h-[calc(100vh-220px)] max-w-[560px] flex-col items-center justify-center text-center">
        <div className="relative flex size-[96px] items-center justify-center rounded-[28px] border border-[#e7dfd3] bg-white shadow-[0_12px_30px_rgba(37,32,24,0.08)]">
          <StaffdeckIcon name="user" size={40} className="text-[#858b9c]" />
          <span className="absolute bottom-[-8px] right-[-8px] flex size-[34px] items-center justify-center rounded-full bg-[#29282d] text-white shadow-[0_6px_16px_rgba(0,0,0,0.22)]">
            <StaffdeckIcon name="plus" size={18} className="text-white" />
          </span>
        </div>

        <h2 className="mt-[24px] text-[22px] font-semibold leading-tight text-[#18181a]">
          还没有数字员工
        </h2>
        <p className="mt-[10px] text-[14px] leading-[22px] text-[#757f9c]">
          {isAdmin
            ? '创建你的第一位数字员工，为它配置知识库、技能与工具，即可开始接管对话与任务。'
            : '当前还没有可管理的数字员工，创建一位或从开放广场复制已发布的配置作为起点。'}
        </p>

        <div className="mt-[28px] flex flex-wrap items-center justify-center gap-[12px]">
          <Button
            onClick={onCreate}
            className="inline-flex h-[42px] items-center gap-[8px] rounded-[14px] bg-[#29282d] px-[22px] text-[14px] font-medium text-white hover:bg-[#3a3940]"
          >
            <StaffdeckIcon name="plus" size={16} className="text-white" />
            新建数字员工
          </Button>
          <Button
            variant="outline"
            onClick={onBrowsePlatform}
            className="inline-flex h-[42px] items-center gap-[8px] rounded-[14px] border-[0.5px] border-[#e3e7f1] bg-white px-[22px] text-[14px] font-normal text-[#464c5e] hover:bg-[#f6f6f6] hover:text-[#464c5e]"
          >
            <StaffdeckIcon name="globe" size={16} />
            浏览开放广场
          </Button>
        </div>
      </div>
    </div>
  );
}
