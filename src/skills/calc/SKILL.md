---
name: 简易计算器
id: calc
description: 四则数学运算，加减乘除
group: util
parameters:
  type: object
  required: [a, op, b]
  properties:
    a:
      type: number
      description: 数字1
    op:
      type: string
      enum: ["+", "-", "*", "/"]
      description: 运算符
    b:
      type: number
      description: 数字2
requires: {}
userInvocable: true
gate: auto
sandboxScope: none
---

仅用于简单数值计算，复杂数学推理交给模型自身，不要连续多次调用计算器。
