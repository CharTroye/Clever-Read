export const sampleDocument = {
  id: 'sample-attention',
  title: 'Understanding Attention',
  subtitle: '理解注意力机制：从直觉到结构',
  type: 'sample',
  author: 'Clever Read · 原创教学示例',
  createdAt: 0,
  blocks: [
    { id: 's-1', section: 'Abstract', text: 'Attention is a mechanism that assigns different weights to different parts of an input. Instead of compressing every detail into one fixed representation, an attention-based model can emphasize the information that matters for a particular task. This teaching note introduces self-attention, its assumptions, and the distinction between a useful explanation and evidence.', page: null },
    { id: 's-2', section: '01  The idea behind attention', text: 'When we read a sentence, we rarely give every word equal importance. In “The animal did not cross the street because it was tired,” the word “it” refers to “the animal.” Resolving this relationship requires information from another part of the sentence. Attention provides a computational way to combine information with unequal weights.', page: null },
    { id: 's-3', section: '01  The idea behind attention', text: 'Self-attention refers to an attention operation in which queries, keys, and values are derived from the same input sequence. Each token produces a query that is compared with the keys of other tokens. The resulting scores are normalized using softmax, and the attention weights determine a weighted combination of the values.', page: null },
    { id: 's-4', section: '02  From similarity to a representation', text: 'A query expresses what a token is looking for; a key describes information that a token can offer; a value contains the information to be combined. In scaled dot-product attention, the dot product between each query and key is divided by the square root of the key dimension before softmax is applied. This scaling is intended to keep large dot products from producing excessively concentrated distributions.', page: null },
    { id: 's-5', section: '02  From similarity to a representation', text: 'Multi-head attention performs several attention operations in parallel, with different learned projections. The outputs of these heads are then combined. This design gives the model multiple opportunities to capture relationships in the sequence, but it does not guarantee that any individual head corresponds to a human-readable linguistic concept.', page: null },
    { id: 's-6', section: '03  What the mechanism does—and does not—tell us', text: 'Because self-attention alone does not encode token order, positional information must be supplied separately when order matters. A model may combine attention with positional encodings, feed-forward networks, and residual connections. Thus, an explanation of an attention layer is not a complete explanation of the whole model.', page: null },
    { id: 's-7', section: '03  What the mechanism does—and does not—tell us', text: 'Attention weights show how values are combined within a particular operation. They should not automatically be interpreted as a causal explanation of the final prediction. A high weight is evidence about that computation, while a claim about causality requires additional assumptions or experiments. Keeping this distinction explicit helps prevent an intuitive explanation from becoming an unsupported conclusion.', page: null },
    { id: 's-8', section: 'Reading notes', text: '阅读提示：点击 self-attention 等术语，查看内置定义；选中完整句子，尝试“拆解逻辑”或提出自己的问题。这是一篇原创教学示例，不是真实发表的论文。没有接入模型时，系统只展示术语库定义和相关原文，不生成论文结论。', page: null }
  ]
};

export const glossary = [
  { term: 'self-attention', aliases: ['self attention', '自注意力'], title: 'Self-attention · 自注意力', definition: '让同一个序列中的元素互相参考，并按不同权重汇总信息的机制。一个词的表示可以因此包含句子中其他词的信息。', hint: '本文第 01 节明确说明：query、key 和 value 都来自同一输入序列。', blockId: 's-3' },
  { term: 'attention', aliases: ['注意力机制'], title: 'Attention · 注意力机制', definition: '给输入中的不同部分分配不同权重，再据此组合信息。权重体现一次计算中的信息组合方式。', hint: '示例开头将 attention 定义为对输入不同部分分配不同权重的机制。', blockId: 's-1' },
  { term: 'softmax', aliases: [], title: 'Softmax · 归一化函数', definition: '把一组实数转换为非负、总和为 1 的权重。分数较大的项通常得到更高权重。', hint: '本文用 softmax 将 query 与 key 的匹配分数转换为注意力权重。', blockId: 's-3' },
  { term: 'multi-head attention', aliases: ['multi head attention', '多头注意力'], title: 'Multi-head attention · 多头注意力', definition: '使用多组不同的投影，并行执行注意力计算，再合并结果。不同的头提供不同的信息组合方式。', hint: '本文提醒：多头结构不保证每个头都有清晰的人类语言学含义。', blockId: 's-5' },
  { term: 'query', aliases: ['queries'], title: 'Query · 查询向量', definition: '在注意力计算中表示当前元素要寻找什么信息的向量。它与 key 比较，得到匹配分数。', hint: '第 02 节用“一个 token 在寻找什么”说明 query 的作用。', blockId: 's-4' },
  { term: 'key', aliases: ['keys'], title: 'Key · 键向量', definition: '用于与 query 比较、计算信息匹配程度的向量。', hint: '第 02 节将 key 描述为一个 token 可以提供的信息线索。', blockId: 's-4' },
  { term: 'value', aliases: ['values'], title: 'Value · 值向量', definition: '注意力权重最终加权组合的内容向量。它与用来计算匹配分数的 query 和 key 承担不同作用。', hint: '第 02 节说明 value 包含真正要被组合的信息。', blockId: 's-4' },
  { term: 'token', aliases: ['tokens'], title: 'Token · 文本单元', definition: '模型处理文本时使用的基本单元，可能是词、词的一部分或标点，并不总与自然语言中的一个词对应。', hint: '', blockId: 's-3' },
  { term: 'positional encodings', aliases: ['positional encoding', '位置编码'], title: 'Positional encoding · 位置编码', definition: '为序列元素加入位置信息，使模型能够利用顺序。具体形式由模型设计决定。', hint: '本文指出：单独的 self-attention 不编码顺序，需要额外的位置信息。', blockId: 's-6' },
  { term: 'residual connections', aliases: ['residual connection', '残差连接'], title: 'Residual connection · 残差连接', definition: '把一层的输入与该层变换后的结果相加，为信息传播和优化提供更直接的路径。', hint: '', blockId: 's-6' },
  { term: 'causality', aliases: ['causal', '因果关系', '因果'], title: 'Causality · 因果关系', definition: '关注改变一个因素是否会引起另一个因素变化。关联或一个较高的注意力权重本身不足以证明因果关系。', hint: '本文最后一节区分计算中的权重与对最终预测的因果解释。', blockId: 's-7' },
  { term: 'independent and identically distributed', aliases: ['i.i.d.', '独立同分布'], title: '独立同分布', definition: '样本彼此独立，且来自相同概率分布。论文中的“假设独立同分布”不等于已证明数据满足该条件。', hint: '', blockId: null },
  { term: 'overfitting', aliases: ['过拟合'], title: 'Overfitting · 过拟合', definition: '模型过度适应训练数据中的细节或噪声，导致在新数据上的表现变差。', hint: '', blockId: null },
  { term: 'statistical significance', aliases: ['statistically significant', '统计显著性'], title: 'Statistical significance · 统计显著性', definition: '在特定统计模型和检验假设下，结果达到预设的显著性判据；它不直接代表效果大小或实际价值。', hint: '', blockId: null }
];

export function findTerm(text) {
  const query = text.trim().toLowerCase().replace(/^[“"‘']|[”"’'.,;:!?。]+$/g, '');
  return glossary.find(g => [g.term, ...g.aliases].some(t => t.toLowerCase() === query));
}

export function localExplanation(doc, selected, action, contexts) {
  const term = findTerm(selected.text);
  if (term && action === 'explain') {
    const sample = doc.id === sampleDocument.id && term.blockId;
    return {
      title: term.title, summary: term.definition,
      context: sample ? term.hint : '这是内置术语库中的通用定义。未调用模型，尚未判断该词在当前文档中的具体含义。',
      logic: [], limitations: '本地术语库 · 未调用模型。原文片段用于对照，不能自动验证通用定义。',
      sources: contexts.filter(c => sample ? c.id === term.blockId || c.id === selected.blockId : c.id === selected.blockId).map(c => c.id), mode: 'local'
    };
  }
  return {
    title: action === 'logic' ? '准备拆解这句话' : action === 'ask' ? '针对选区提问' : '已定位这段原文',
    summary: action === 'explain' ? '内置术语库还没有收录这个选区。接入模型后，可以结合文档上下文解释它。' : '尚未接入模型，不能生成这次问题的分析。可以先核对下方相关原文，或在设置中连接模型后继续。',
    context: '以下是选区附近及关键词匹配到的原文片段。这些摘录由本地检索获得，不是模型给出的结论。',
    logic: [], limitations: '本地辅助 · 未调用模型。不会用预设答案替代自由问答。', sources: contexts.map(c => c.id), mode: 'local'
  };
}
