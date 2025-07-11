import React, { useEffect, useState, useMemo } from 'react';
import { ArrowLeft, Search, Filter, X } from 'lucide-react';
import ProductCard from '../components/ProductCard';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';

interface Product {
  id: string;
  name_en?: string;
  name_ml?: string;
  name_manglish?: string;
  category?: string;
  price?: number;
  imageUrl?: string;
  available?: boolean;
  description?: string;
  netQuantity?: string;
}

interface SearchPageProps {
  onBack: () => void;
  initialQuery?: string;
}

// Advanced fuzzy search function with typo tolerance and phonetic matching
const fuzzyMatch = (text: string, query: string): number => {
  if (!text || !query) return 0;
  
  const textLower = text.toLowerCase();
  const queryLower = query.toLowerCase();
  
  // Exact match gets highest score
  if (textLower.includes(queryLower)) {
    return textLower === queryLower ? 100 : 85;
  }
  
  // Calculate Levenshtein distance for fuzzy matching
  const calculateDistance = (a: string, b: string): number => {
    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
    
    for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= b.length; j++) {
      for (let i = 1; i <= a.length; i++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + cost
        );
      }
    }
    
    return matrix[b.length][a.length];
  };
  
  // Check for partial matches with different thresholds
  const words = textLower.split(' ');
  const queryWords = queryLower.split(' ');
  
  let bestScore = 0;
  
  // Check each word combination
  for (const word of words) {
    for (const qWord of queryWords) {
      const distance = calculateDistance(word, qWord);
      const maxLength = Math.max(word.length, qWord.length);
      const similarity = (maxLength - distance) / maxLength;
      
      if (similarity > 0.5) {
        bestScore = Math.max(bestScore, similarity * 70);
      }
    }
  }
  
  // Check for substring matches
  if (bestScore === 0) {
    for (const word of words) {
      if (word.includes(queryLower) || queryLower.includes(word)) {
        bestScore = Math.max(bestScore, 60);
      }
    }
  }
  
  return bestScore;
};

// Enhanced search function with smart suggestions and typo tolerance
const searchProducts = (products: Product[], query: string) => {
  if (!query.trim()) return [];
  
  const searchTerms = query.toLowerCase().trim().split(' ').filter(Boolean);
  
  const results = products.map(product => {
    let maxScore = 0;
    let matchedFields: string[] = [];
    
    // Search in all name fields with different weights
    const nameFields = [
      { value: product.name_en || '', weight: 1.0, field: 'name_en' },
      { value: product.name_ml || '', weight: 1.0, field: 'name_ml' },
      { value: product.name_manglish || '', weight: 1.0, field: 'name_manglish' }
    ];
    
    // Search in category and description with lower weights
    const otherFields = [
      { value: product.category || '', weight: 0.8, field: 'category' },
      { value: product.description || '', weight: 0.6, field: 'description' }
    ];
    
    const allFields = [...nameFields, ...otherFields];
    
    // Calculate scores for each field
    for (const field of allFields) {
      for (const term of searchTerms) {
        const score = fuzzyMatch(field.value, term) * field.weight;
        if (score > maxScore) {
          maxScore = score;
          matchedFields = [field.field];
        } else if (score === maxScore && score > 0) {
          matchedFields.push(field.field);
        }
      }
    }
    
    // Boost score for multiple term matches
    if (searchTerms.length > 1) {
      let multiTermScore = 0;
      for (const field of allFields) {
        const matchCount = searchTerms.filter(term => 
          fuzzyMatch(field.value, term) > 30
        ).length;
        
        if (matchCount > 1) {
          multiTermScore = Math.max(multiTermScore, (matchCount / searchTerms.length) * 20);
        }
      }
      maxScore += multiTermScore;
    }
    
    return { 
      product, 
      score: maxScore, 
      matchedFields: [...new Set(matchedFields)]
    };
  })
  .filter(result => result.score > 25) // Lower threshold for better recall
  .sort((a, b) => b.score - a.score)
  .map(result => result.product);
  
  return results;
};

// Generate search suggestions based on query and available products
const generateSuggestions = (products: Product[], query: string): string[] => {
  if (!query.trim() || query.length < 2) return [];
  
  const suggestions = new Set<string>();
  const queryLower = query.toLowerCase();
  
  products.forEach(product => {
    // Check all name fields for partial matches
    [product.name_en, product.name_ml, product.name_manglish, product.category].forEach(field => {
      if (field && field.toLowerCase().includes(queryLower)) {
        suggestions.add(field);
      }
    });
  });
  
  return Array.from(suggestions)
    .sort((a, b) => {
      // Prioritize exact starts
      const aStarts = a.toLowerCase().startsWith(queryLower);
      const bStarts = b.toLowerCase().startsWith(queryLower);
      
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      
      return a.length - b.length; // Shorter suggestions first
    })
    .slice(0, 5);
};

const CATEGORIES = [
  'All',
  // Grocery & Kitchen
  'Fruits and Vegetables',
  'Rice, Atta & Dal',
  'Oil, Ghee & Masala',
  'Dairy, Breads & Eggs',
  'Chicken, Meat & Fish',
  'Kitchenware & Appliances',
  
  // Snacks & Drinks  
  'Chips',
  'Sweet Chocolates',
  'Bakery and Biscuits',
  'Drinks and Juices',
  'Tea, Coffee & Milk Drinks',
  'Instant Food',
  
  // Beauty & Personal Care
  'Bath & Body',
  'Hair',
  'Skin & Face',
  'Feminine Hygiene',
  'Baby Care',
  'Beauty and Cosmetics',
  
  // Household Essentials
  'Home & Lifestyle',
  'Cleaners & Repellents',
  'Electronics',
  'Stationery & Games'
];

const SearchPage: React.FC<SearchPageProps> = ({ onBack, initialQuery = '' }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [sortBy, setSortBy] = useState<'relevance' | 'price_low' | 'price_high' | 'name'>('relevance');
  const [showFilters, setShowFilters] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Fetch products
  useEffect(() => {
    async function fetchProducts() {
      setLoading(true);
      console.log('🔍 [SearchPage] Fetching products...');
      const snap = await getDocs(collection(db, 'products'));
      const fetchedProducts: Product[] = snap.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      } as Product));
      
      console.log('📦 [SearchPage] Fetched products:', fetchedProducts.length);
      setProducts(fetchedProducts);
      setLoading(false);
    }
    fetchProducts();
  }, []);

  // Search and filter products
  const filteredProducts = useMemo(() => {
    console.log('🔍 [SearchPage] Searching for:', searchQuery);
    
    let results = searchQuery.trim() 
      ? searchProducts(products, searchQuery)
      : products;

    // Filter by category
    if (selectedCategory !== 'All') {
      results = results.filter(p => p.category === selectedCategory);
    }

    // Filter available products only
    results = results.filter(p => p.available !== false);

    // Sort results
    switch (sortBy) {
      case 'price_low':
        results.sort((a, b) => (a.price || 0) - (b.price || 0));
        break;
      case 'price_high':
        results.sort((a, b) => (b.price || 0) - (a.price || 0));
        break;
      case 'name':
        results.sort((a, b) => (a.name_en || '').localeCompare(b.name_en || ''));
        break;
      // 'relevance' is already sorted by search algorithm
    }

    console.log('📊 [SearchPage] Filtered results:', results.length);
    return results;
  }, [products, searchQuery, selectedCategory, sortBy]);

  // Popular search suggestions
  const popularSearches = [
    'Rice', 'Onion', 'Potato', 'Tomato', 'Milk', 'Bread', 'Oil', 'Sugar',
    'Basmati Rice', 'Coconut Oil', 'Ghee', 'Dal', 'Atta', 'Masala'
  ];

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setShowSuggestions(false);
    
    // Generate suggestions for next time
    if (query.length >= 2) {
      const newSuggestions = generateSuggestions(products, query);
      setSuggestions(newSuggestions);
    } else {
      setSuggestions([]);
    }
  };

  const handleSearchInputChange = (query: string) => {
    setSearchQuery(query);
    
    // Show suggestions as user types
    if (query.length >= 2) {
      const newSuggestions = generateSuggestions(products, query);
      setSuggestions(newSuggestions);
      setShowSuggestions(newSuggestions.length > 0);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setSearchQuery(suggestion);
    setShowSuggestions(false);
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSuggestions([]);
    setShowSuggestions(false);
  };

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-100 px-3 sm:px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button 
            onClick={onBack}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} className="text-gray-600" />
          </button>
          
          <div className="flex-1 relative">
            <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchInputChange(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch(searchQuery)}
              placeholder="Search for products..."
              className="w-full pl-10 pr-10 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={clearSearch}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            )}
            
            {/* Search Suggestions Dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg mt-1 shadow-lg z-20 max-h-60 overflow-y-auto">
                {suggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0 text-sm"
                  >
                    <Search size={14} className="inline mr-2 text-gray-400" />
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
          
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors relative"
          >
            <Filter size={20} className="text-gray-600" />
            {(selectedCategory !== 'All' || sortBy !== 'relevance') && (
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-teal-500 rounded-full" />
            )}
          </button>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="mt-3 p-3 bg-gray-50 rounded-lg">
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full p-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  {CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Sort by</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="w-full p-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="relevance">Relevance</option>
                  <option value="price_low">Price: Low to High</option>
                  <option value="price_high">Price: High to Low</option>
                  <option value="name">Name: A to Z</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3 sm:p-4 pb-24">
        {!searchQuery ? (
          // No search query - show popular searches and categories
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Popular Searches</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-8">
              {popularSearches.map(term => (
                <button
                  key={term}
                  onClick={() => handleSearch(term)}
                  className="p-4 bg-white border border-gray-200 rounded-xl text-left hover:bg-gray-50 hover:border-teal-200 transition-all group"
                >
                  <Search size={16} className="text-gray-400 group-hover:text-teal-500 mb-2" />
                  <p className="font-medium text-gray-800 text-sm">{term}</p>
                </button>
              ))}
            </div>
            
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Browse by Category</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
              {CATEGORIES.slice(1, 7).map(category => (
                <button
                  key={category}
                  onClick={() => {
                    setSelectedCategory(category);
                    setSearchQuery(' '); // Trigger search with empty query but filter applied
                  }}
                  className="p-4 bg-white border border-gray-200 rounded-xl text-left hover:bg-gray-50 hover:border-teal-200 transition-all"
                >
                  <p className="font-medium text-gray-800 text-sm">{category}</p>
                  <p className="text-xs text-gray-500 mt-1">Browse all {category.toLowerCase()}</p>
                </button>
              ))}
            </div>
            
            <div className="text-center text-gray-500 py-8">
              <Search size={48} className="mx-auto mb-4 text-gray-300" />
              <p className="text-lg font-medium">What are you looking for?</p>
              <p className="text-sm">Start typing to search our entire catalog</p>
            </div>
          </div>
        ) : loading ? (
          // Loading state
          <div className="text-center text-gray-500 py-8">
            <div className="relative">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-teal-100 border-t-teal-500 mx-auto mb-4"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <Search size={20} className="text-teal-500" />
              </div>
            </div>
            <p className="text-lg font-medium">Searching products...</p>
            <p className="text-sm text-gray-400 mt-1">Finding the best matches for you</p>
          </div>
        ) : (
          // Search results
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">
                {filteredProducts.length > 0 ? (
                  <>Search Results ({filteredProducts.length})</>
                ) : (
                  'No Results Found'
                )}
              </h2>
              
              {searchQuery && (
                <div className="text-sm text-gray-500">
                  for "{searchQuery}"
                </div>
              )}
            </div>

            {filteredProducts.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                {filteredProducts.map(product => (
                  <ProductCard
                    key={product.id}
                    id={product.id}
                    name={product.name_en || 'Unknown Product'}
                    malayalamName={product.name_ml}
                    manglishName={product.name_manglish}
                    price={product.price || 0}
                    imageUrl={product.imageUrl}
                    netQuantity={product.netQuantity}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center text-gray-500 py-8">
                <Search size={48} className="mx-auto mb-4 text-gray-300" />
                <p className="text-lg mb-2">No products found for "{searchQuery}"</p>
                <p className="text-sm mb-4">Don't worry! Try these tips:</p>
                
                <div className="text-left max-w-md mx-auto mb-6 space-y-2">
                  <p className="text-sm">• Check your spelling</p>
                  <p className="text-sm">• Use simpler words (e.g., "rice" instead of "basmati rice")</p>
                  <p className="text-sm">• Try searching in English, Malayalam, or Manglish</p>
                  <p className="text-sm">• Search by category (e.g., "vegetables", "fruits")</p>
                </div>
                
                {/* Suggest popular searches */}
                <div className="mt-6">
                  <p className="text-sm text-gray-600 mb-3">Try these popular searches:</p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {popularSearches.slice(0, 6).map(term => (
                      <button
                        key={term}
                        onClick={() => handleSearch(term)}
                        className="px-3 py-1 bg-teal-50 text-teal-600 rounded-full text-sm hover:bg-teal-100 transition-colors"
                      >
                        {term}
                      </button>
                    ))}
                  </div>
                </div>
                
                {/* Suggest clearing filters */}
                {(selectedCategory !== 'All' || sortBy !== 'relevance') && (
                  <div className="mt-4">
                    <button
                      onClick={() => {
                        setSelectedCategory('All');
                        setSortBy('relevance');
                      }}
                      className="text-teal-600 hover:text-teal-700 text-sm underline"
                    >
                      Clear all filters and try again
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchPage;
