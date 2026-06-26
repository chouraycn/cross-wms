import Foundation
import Accelerate
import OSLog
import CrossWMSIPC

private let embeddingLogger = Logger(subsystem: "com.cdf.knowclow", category: "embedding")

actor EmbeddingManager {
    static let shared = EmbeddingManager()
    
    private init() {}
    
    private let defaultModel = "text-hash-embedding-v1"
    private let defaultDimensions = 768
    
    func computeEmbeddings(texts: [String], model: String?, dimensions: Int?) -> EmbeddingResult {
        let dim = validateDimensions(dimensions)
        let modelName = model ?? defaultModel
        
        embeddingLogger.info("Computing embeddings for \(texts.count) texts, model: \(modelName, privacy: .public), dimensions: \(dim)")
        
        var embeddings: [[Float]] = []
        embeddings.reserveCapacity(texts.count)
        
        for text in texts {
            let vector = hashEmbedding(for: text, dimensions: dim)
            let normalized = normalizeVector(vector)
            embeddings.append(normalized)
        }
        
        embeddingLogger.info("Embeddings computed successfully")
        
        return EmbeddingResult(
            embeddings: embeddings,
            model: modelName,
            dimensions: dim
        )
    }
    
    private func validateDimensions(_ dimensions: Int?) -> Int {
        guard let dim = dimensions else {
            return defaultDimensions
        }
        
        guard dim > 0 else {
            embeddingLogger.warning("Invalid dimensions \(dim), using default \(self.defaultDimensions)")
            return defaultDimensions
        }
        
        return dim
    }
    
    private func hashEmbedding(for text: String, dimensions: Int) -> [Float] {
        let data = Array(text.utf8)
        var vector = [Float](repeating: 0.0, count: dimensions)
        
        for (i, byte) in data.enumerated() {
            let hash1 = murmurhash32(data: data, seed: UInt32(i))
            let hash2 = murmurhash32(data: data, seed: UInt32(i + 1000))
            
            let idx1 = Int(hash1) % dimensions
            let idx2 = Int(hash2) % dimensions
            
            let weight = Float(byte) / 255.0
            
            vector[idx1] += weight * Float(cos(Double(hash2) * 0.01))
            vector[idx2] -= weight * Float(sin(Double(hash1) * 0.01))
        }
        
        let ngramSize = 3
        if data.count >= ngramSize {
            for i in 0..<(data.count - ngramSize + 1) {
                let ngram = Array(data[i..<(i + ngramSize)])
                let hash = murmurhash32(data: ngram, seed: UInt32(i * 7))
                let idx = Int(hash) % dimensions
                let sign = (hash & 1) == 0 ? Float(1.0) : Float(-1.0)
                vector[idx] += sign * 0.1
            }
        }
        
        return vector
    }
    
    private func murmurhash32(data: [UInt8], seed: UInt32) -> UInt32 {
        let c1: UInt32 = 0xcc9e2d51
        let c2: UInt32 = 0x1b873593
        let r1: UInt32 = 15
        let r2: UInt32 = 13
        let m: UInt32 = 5
        let n: UInt32 = 0xe6546b64
        
        var hash = seed
        let length = data.count
        
        let numBlocks = length / 4
        
        for i in 0..<numBlocks {
            let idx = i * 4
            var k: UInt32 = 0
            k |= UInt32(data[idx])
            k |= UInt32(data[idx + 1]) << 8
            k |= UInt32(data[idx + 2]) << 16
            k |= UInt32(data[idx + 3]) << 24
            
            k = k &* c1
            k = (k << r1) | (k >> (32 - r1))
            k = k &* c2
            
            hash ^= k
            hash = (hash << r2) | (hash >> (32 - r2))
            hash = hash &* m &+ n
        }
        
        let tailStart = numBlocks * 4
        var k: UInt32 = 0
        
        let tailLength = length & 3
        if tailLength >= 3 {
            k |= UInt32(data[tailStart + 2]) << 16
        }
        if tailLength >= 2 {
            k |= UInt32(data[tailStart + 1]) << 8
        }
        if tailLength >= 1 {
            k |= UInt32(data[tailStart])
            
            k = k &* c1
            k = (k << r1) | (k >> (32 - r1))
            k = k &* c2
            hash ^= k
        }
        
        hash ^= UInt32(length)
        
        hash ^= hash >> 16
        hash = hash &* 0x85ebca6b
        hash ^= hash >> 13
        hash = hash &* 0xc2b2ae35
        hash ^= hash >> 16
        
        return hash
    }
    
    private func normalizeVector(_ vector: [Float]) -> [Float] {
        let count = vDSP_Length(vector.count)
        var result = vector
        
        let norm = cblas_snrm2(Int32(vector.count), vector, 1)
        
        guard norm > 0 else {
            embeddingLogger.warning("Zero norm vector encountered, returning original vector")
            return result
        }
        
        var scale: Float = 1.0 / norm
        vDSP_vsmul(result, 1, &scale, &result, 1, count)
        
        return result
    }
}
